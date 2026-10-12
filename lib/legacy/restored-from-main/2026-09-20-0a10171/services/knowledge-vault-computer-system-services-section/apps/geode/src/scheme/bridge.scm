;; bridge.scm — the Scheme side of the Geode <-> Guile spike bridge.
;;
;; TRUST BOUNDARY, stated plainly because this process evaluates code:
;;
;;   This process evaluates whatever Scheme text arrives on its stdin frame protocol, in a
;;   single shared top-level environment, with FULL ambient authority: filesystem, network,
;;   process spawning, everything an ordinary `guile` process can do. Nothing here is sandboxed.
;;   It exists to be driven by a trusted local Node parent (guile-bridge.mjs) that itself decides
;;   what Scheme text to send. It must NEVER be wired so that an HTTP request, or any other
;;   untrusted input, can reach the "code" field of a request frame. That is a different, harder
;;   problem (see (ice-9 sandbox), noted but not used here) and is explicitly out of scope for
;;   this spike.
;;
;; PROTOCOL: length-prefixed frames on stdin/stdout, byte-exact.
;;
;;   Every frame, in both directions, is:
;;       <ASCII decimal byte-length> "\n" <that many bytes of UTF-8 JSON>
;;   with no trailing newline after the payload. The length is read one byte at a time
;;   (get-u8) up to the newline, then the payload is read with get-bytevector-n for exactly
;;   that many bytes. This is deliberate: it is immune to a partial read (the reader just
;;   blocks for more bytes, it never misparses a short read as a complete frame) and immune to
;;   anything the evaluated code itself prints, because that output is captured with
;;   with-output-to-string during evaluation and returned as the response's "output" field —
;;   it never touches the real stdout port that frames travel over. A Scheme-level error can
;;   never corrupt the channel because it is caught (catch #t) and turned into response data.
;;
;;   Request  (Node -> Guile): {"id": <int>, "op": "eval"|"ping", "code": <string>,
;;                              "timeoutSeconds": <number or omitted>}
;;   Response (Guile -> Node): {"id": <int>, "ok": <bool>, "value": <json-safe>,
;;                              "output": <string, captured stdout>,
;;                              "error": null | {"key": <string>, "irritants": [<string>...],
;;                                               "message": <string>}}
;;
;; TIMEOUT: a per-request SIGALRM is installed before evaluation and cancelled (via
;; dynamic-wind) after. Firing throws 'geode-bridge-timeout, which the eval catch turns into an
;; ordinary error response — the *process itself* is not killed and whatever was already
;; defined (e.g. loaded EAVT rows) survives for the next request. This is a best-effort,
;; in-process recovery: it relies on Guile's VM checking for pending signals at safe points,
;; which measurably happens even inside a tight non-allocating tail loop (tested). It is not
;; airtight against adversarial code that masks SIGALRM or blocks in a non-yielding primitive —
;; guile-bridge.mjs additionally runs its own wall-clock kill timer as the actual guarantee.

(use-modules (json)
             (srfi srfi-1)
             (ice-9 binary-ports)
             (rnrs bytevectors))

;; Capture the real stdio ports before any evaluated code gets a chance to reassign the
;; current-output-port / current-input-port parameters (which, unlike a dynamic-wind-scoped
;; rebinding, would otherwise persist past the call that did it).
(define REAL-IN (current-input-port))
(define REAL-OUT (current-output-port))

(setvbuf REAL-IN 'block)
(setvbuf REAL-OUT 'block)

;; ---------------------------------------------------------------------------
;; Framing
;; ---------------------------------------------------------------------------

(define (read-length-prefix port)
  "Read ASCII decimal digits up to a newline, byte at a time. Returns 'eof at end of stream."
  (let loop ((digits '()))
    (let ((b (get-u8 port)))
      (cond
        ((eof-object? b) (if (null? digits) 'eof (error "geode-bridge: eof mid length-prefix")))
        ((= b 10) (string->number (list->string (reverse (map integer->char digits)))))
        (else (loop (cons b digits)))))))

(define (read-frame port)
  "Read one length-prefixed frame as a string, or #f at clean end of stream."
  (let ((n (read-length-prefix port)))
    (if (eq? n 'eof)
        #f
        (utf8->string (get-bytevector-n port n)))))

(define (write-frame port str)
  (let* ((payload (string->utf8 str))
         (n (bytevector-length payload))
         (header (string->utf8 (string-append (number->string n) "\n"))))
    (put-bytevector port header)
    (put-bytevector port payload)
    (force-output port)))

;; ---------------------------------------------------------------------------
;; JSON-safe value conversion
;;
;; Deliberately narrow rather than clever, because a Scheme list and a Scheme alist are the
;; same underlying shape and guessing wrong would silently corrupt what came back. The rule
;; query code must follow: build a VECTOR to mean "JSON array," build a list of (string . value)
;; pairs to mean "JSON object." A bare list is treated as an array only as a last-resort
;; fallback, after the alist check has had first refusal.
;; ---------------------------------------------------------------------------

(define (alist-of-strings? x)
  (and (list? x) (pair? x)
       (every (lambda (entry) (and (pair? entry) (string? (car entry)))) x)))

(define (json-safe x)
  (cond
    ((boolean? x) x)
    ((number? x) x)
    ((string? x) x)
    ((symbol? x) (symbol->string x))
    ((null? x) (vector))
    ((vector? x) (list->vector (map json-safe (vector->list x))))
    ((alist-of-strings? x) (map (lambda (entry) (cons (car entry) (json-safe (cdr entry)))) x))
    ((list? x) (list->vector (map json-safe x)))
    ((pair? x) (vector (json-safe (car x)) (json-safe (cdr x)))) ; improper pair fallback
    (else (format #f "~s" x))))

(define (safe-atom x)
  (cond
    ((string? x) x)
    ((number? x) x)
    ((boolean? x) x)
    ((symbol? x) (symbol->string x))
    (else (format #f "~s" x))))

(define (error->json err)
  (if (not err)
      'null
      (list (cons "key" (safe-atom (car err)))
            (cons "irritants" (list->vector (map safe-atom (cdr err))))
            (cons "message" (format #f "~s" err)))))

;; ---------------------------------------------------------------------------
;; Timeout: SIGALRM-based interrupt around one evaluation.
;; ---------------------------------------------------------------------------

(define (call-with-timeout seconds thunk)
  (if (or (not seconds) (not (number? seconds)) (<= seconds 0))
      (thunk)
      (dynamic-wind
        (lambda ()
          (sigaction SIGALRM (lambda (sig) (throw 'geode-bridge-timeout
                                                    (format #f "evaluation exceeded ~as" seconds))))
          (alarm (inexact->exact (round seconds))))
        thunk
        (lambda () (alarm 0)))))

;; ---------------------------------------------------------------------------
;; Evaluation: every top-level form in code-string is read and evaluated in turn, in the
;; shared (guile-user) top level, so a `define` in one request is visible to the next. The
;; result is the value of the LAST form. All of this runs under one catch #t, so any Scheme
;; error — an unbound variable, wrong-type argument, user (error ...) call, or the timeout
;; throw above — comes back as data, never as a crashed process.
;; ---------------------------------------------------------------------------

(define (eval-forms code-string)
  (define result #f)
  (define had-error #f)
  (define error-info #f)
  (define output
    (with-output-to-string
      (lambda ()
        (catch #t
          (lambda ()
            (let loop ((port (open-input-string code-string)))
              (let ((form (read port)))
                (unless (eof-object? form)
                  (set! result (primitive-eval form))
                  (loop port)))))
          (lambda (key . args)
            (set! had-error #t)
            (set! error-info (cons key args)))))))
  (values had-error result error-info output))

;; ---------------------------------------------------------------------------
;; Request dispatch
;; ---------------------------------------------------------------------------

(define (respond id ok value output error)
  (write-frame REAL-OUT
    (scm->json-string
      (list (cons "id" id)
            (cons "ok" ok)
            (cons "value" value)
            (cons "output" output)
            (cons "error" error)))))

(define (handle-eval req id)
  (let ((code (assoc-ref req "code"))
        (timeout (assoc-ref req "timeoutSeconds")))
    (call-with-values
      (lambda () (call-with-timeout timeout (lambda () (eval-forms code))))
      (lambda (had-error result error-info output)
        (respond id (not had-error)
                 (if had-error 'null (json-safe result))
                 output
                 (error->json error-info))))))

(define (handle-request frame)
  (catch #t
    (lambda ()
      (let* ((req (json-string->scm frame))
             (id (assoc-ref req "id"))
             (op (assoc-ref req "op")))
        (cond
          ((equal? op "eval") (handle-eval req id))
          ((equal? op "ping") (respond id #t "pong" "" 'null))
          (else (respond id #f 'null "" (error->json (list 'unknown-op (or op "")))))
          )))
    (lambda (key . args)
      ;; A malformed request frame (bad JSON, missing id) must not take the loop down either.
      (write-frame REAL-OUT
        (scm->json-string (list (cons "id" 'null) (cons "ok" #f) (cons "value" 'null)
                                 (cons "output" "") (cons "error" (error->json (cons key args)))))))))

(define (main-loop)
  (let loop ()
    (let ((frame (read-frame REAL-IN)))
      (when frame
        (handle-request frame)
        (loop)))))

(main-loop)

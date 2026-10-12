;; depends-on.scm — one real query over Geode's EAVT rows, run through guile-bridge.mjs.
;;
;; Answers: "every concept some document declares `depends-on`" — the corpus question named in
;; the spike's requirement 4. Expects the global `eavt-rows` to already be bound to a VECTOR of
;; row vectors #(e a v t), the representation the marshalling spike settled on (see
;; guile-bridge.test.mjs and the spike report for why: it is the fastest of the four measured).
;;
;; This file is meant to be loaded into a running bridge with
;;   bridge.eval(`(load ,(JSON.stringify(pathToThisFile)))`)
;; or, equivalently, its text can be sent directly as `code` — both paths run the same forms in
;; the same shared top-level, which is the whole point of a long-lived process (see bridge.scm).

(define (row-a row) (vector-ref row 1))
(define (row-v row) (vector-ref row 2))

;; Every distinct concept some document declares `depends-on`, sorted for a stable comparison
;; against an independently computed answer (Node re-deriving the same set straight from the
;; ledger is the correctness check this spike reports against).
(define (depends-on-concepts rows)
  (let ((seen (make-hash-table))
        (n (vector-length rows)))
    (let loop ((i 0))
      (when (< i n)
        (let ((row (vector-ref rows i)))
          (when (string=? (row-a row) "depends-on") (hash-set! seen (row-v row) #t)))
        (loop (+ i 1))))
    (list->vector (sort (hash-map->list (lambda (key value) key) seen) string<?))))

(depends-on-concepts eavt-rows)

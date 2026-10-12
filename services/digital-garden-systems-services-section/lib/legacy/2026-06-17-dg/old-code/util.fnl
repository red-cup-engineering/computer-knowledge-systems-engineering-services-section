(local fennel (require :fennel))
(local math (require :math))
;;; data
(lambda save-data [data path]
  (let [save-file (io.open (.. path ".fnl") :w)]
    (save-file:write (fennel.view data))
    (save-file:close)))
(lambda load-data [path ?fallback]
  (let [load-file (io.open (.. path ".fnl") :r)]
    (if load-file
        (let [loaded-data (load-file:read "*all")]
          (fennel.eval loaded-data))
        (if ?fallback
            (do
              (save-data ?fallback path)
              (load-data path))
            (print (.. "No file at " path
                       " and no fallback given. Failed to load."))))))
;;; meta
(lambda docstring [func]
  (fennel.doc func))
;;; sequences
(lambda find-key [seq query]
  "Return the first key in the SEQuence whose value matches QUERY."
  (each [key val (pairs seq)]
    (when (= val query) key)))
;;; tables
(lambda collect-keys [tab]
  "Return a sequence of TABle's keys."
  (icollect [key _ (pairs tab)] key))
(lambda random-value [tab]
  (. tab (math.random (length tab))))
(lambda remove-value [tab item]
  (each [key value (pairs tab)]
    (when (= value item)
      (table.remove tab key)))
  tab)
;;; strings
(lambda make-id [?existing]
  "Generates an ID, dismissing it if its already in EXISTING."
  (lambda f [x]
    (var r (- (math.random 16) 1))
    (set r (or (and (= x :x) (+ r 1)) (+ (% r 4) 9)))
    (: :0123456789abcdef :sub r r))
  (let [gen (: :xxxxxxxx :gsub "[xy]" f)]
    (when ?existing
      (each [_ id (pairs ?existing)]
        (when (= gen id)
          (make-id ?existing))))
    gen))
(lambda make-string-appender [?sep]
  "Return function appender, which encloses a string and optionally accepts an argument (string or list of strings), which if provided will be concatenated to the end of the enclosed string, optionally with the ?SEParator provided (between each string, if a list of strings is provided). If no argument is given to the appender function, the enclosed string is returned."
  (var o "")
  (lambda appender [?a]
    (lambda q [r]
      (set o (.. o r (or ?sep ""))) o)
    (if ?a
        (if (= (type ?a) :string)
              (q ?a)
              (each [_ v (pairs ?a)]
                (q v)))
        o)))
(lambda make-string-inserters [str]
  "Return a table of fuctions for concatenating text around the STRing: P(refix) accepts a string which is concatenated to the front of STRing, I(nsert) accepts two strings which are added before and after the STRing, and S(uffix) accepts one string which is affixed to the end of the STRing."
  {:P (lambda [p] (.. p str))
   :I (lambda [p s] (.. p str s))
   :S (lambda [s] (.. str s))})
(lambda quibble-strings [strings ?resort ?oxfordize]
  "Return the sequence of STRINGS separated with commas and the conjunction 'and'. ?OXFORDIZE is currently irrelevant; strings are oxfordized by defualt."
  (let [oxfordize (or ?oxfordize true)
        o (make-string-appender)]
    (when ?resort (table.sort strings))
    (var join "")
    (for [count 1
          (length strings) 1]
      (if (= count (length strings))
          (set join "")
          (= count (- (length strings) 1))
          (set join
               (.. (if (and oxfordize
                            (> (length strings) 2))
                       ","
                       "")
                   " and "))
          (set join ", "))
      (o [(. strings count) join]))
    (o)))
;;; time
(lambda render-time [time]
  (os.date "%Y%m%d:%H%M" time))
{: save-data : load-data : find-key : collect-keys : random-value : remove-value : make-id : make-string-appender : make-string-inserters : quibble-strings : render-time : docstring}

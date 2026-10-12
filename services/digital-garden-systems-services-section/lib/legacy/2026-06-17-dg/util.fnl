(local socket (require :socket))
(local fennel (require :fennel))

(lambda add-values [tab vals]
  (each [k v (pairs vals)]
    (tset tab k v))
  tab)

(lambda clone-table [tab ?new-values]
  (local clone {})
  (add-values clone tab)
  (when ?new-values (add-values clone ?new-values))
  clone)

(lambda collect-keys [tbl]
  "Return a list of the keys in TBL."
  (icollect [key _ (pairs tbl)] key))

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

(fn find-element [seq query]
  (let [matched []]
    (each [_ element (pairs seq)]
      (when (= element query)
        (table.insert matched element)))
    (if (> (length matched) 0) true nil)))

(fn find-item [tab query ?vals]
  (let [seq []]
  (each [key val (pairs tab)]
    (if ?vals
        (table.insert seq val)
        (table.insert seq key)))
  (find-element seq query)))
     
(fn make-id [?existing]
  (print :EXISTING (fennel.view ?existing))
  (fn gen-id [x]
    (let [r (- (math.random 16) 1)
          p (or (and (= x :x) (+ r 1)) (+ (% r 4) 9))]
      (: :0123456789abcdef :sub p p)))
  (let [gen (: :xxxxxxxx :gsub "[xy]" gen-id)]
    (print "generated" gen)
    (print (find-element (or ?existing []) gen))
    (if (find-element (or ?existing []) gen)
        (make-id ?existing)
        gen)))

(lambda make-string-appender [?sep]
  "Return a function that holds a string and accepts one atctional argument (string or list of strings). If provided, the argument is appended to the held string, with SEP appended (to each one, if its a list of strings.)"
  (var o "")
  (lambda [?a]
    (lambda q [r]
      (set o (.. o r (or ?sep ""))) o)
    (if ?a
        (if (= (type ?a) :string)
              (q ?a)
              (each [_ v (pairs ?a)]
                (q v)))
        o)))


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

(lambda remove-value [tab item]
  (each [key value (pairs tab)]
    (when (= value item)
      (table.remove tab key)))
  tab)

(lambda render-time [time]
  (os.date "%Y%m%d:%H%M" time))

{: add-values
 : clone-table
 : collect-keys
 : find-element
 : find-item
 : load-data
 : make-id
 : make-string-appender
 : quibble-strings
 : remove-value
 : render-time
 : save-data
 : fennel
 : socket}


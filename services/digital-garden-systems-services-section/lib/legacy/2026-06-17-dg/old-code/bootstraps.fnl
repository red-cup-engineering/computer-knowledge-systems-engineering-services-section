;;;; digital garden engine bootstraps
;; this is the first file in my digital garden
;; it's here to bootstrap the rest.
;;; o golly here we go!
(local fennel (require :fennel))
;; utilities
(lambda load-data [path]
  "Load the .fnl file at PATH, as data"
  (fennel.eval
   (: (io.open (.. path ".fnl") :r)
      :read "*all")))
(lambda save-data [data path]
  "Save DATA to a .fnl file at PATH."
  (let [src (io.open (.. path ".fnl") :w)]
    (src:write (fennel.view data))
    (src:close)))
;; changelog stuff
(local changelog {})
(lambda changelog.load [] (load-data :data/changelog))
(lambda changelog.save [log] (save-data log :data/changelog))
(lambda changelog.make-entry [author status element ?note]
  {:time (os.time) : author : status : element
   :note (or ?note nil)}) ; setting a table value to nil drops it from the table
(lambda changelog.submit-entry [entry]
  (let [changelog (changelog.load)]
    (table.insert changelog.entries entry)
    (changelog.save changelog)))
(lambda changelog.ms-entry [author status element ?note]
  (changelog.make-entry
   (changelog.submit-entry author status element ?note)))
;; next, a way to write down plans!
(lambda ms-plan [author urgency description]
  "Make a plan of URGency and IMPortance with DESCription by AUTHOR"
  (let [plans (load-data :data/plans)]
    (table.insert plans {:time (os.time) : author : urgency : description})
    (save-data plans :data/plans)))
;; lets export our functions
{: load-changelog : save-changelog
 : make-changelog-entry : submit-changelog-entry
 : ms-change
 : ms-plan }

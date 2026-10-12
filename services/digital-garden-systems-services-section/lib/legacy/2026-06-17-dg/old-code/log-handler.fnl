(local util (require :util))

(local data-handler (require :data-handler))

(lambda make [?file-name ?name ?base]
  "Return a log-handler based on ?BASE and a data-handler whose name is, by default, log. The log-handler also has a submit-log-entry method, which adds the given ENTRY to the log."
  (let [name (or ?name :log)
        file-name (or ?file-name name)
        logger (data-handler.make file-name name ?base)
        I (util.make-string-inserters name)]
    (tset logger (I.I :submit- :-entry)
          (lambda submit-log-entry [logger entry]
            (let [entries (: logger (I.P :load-))]
              (table.insert entries entry)
              (: logger (I.P :save-) entries))))
    logger))

{: make}

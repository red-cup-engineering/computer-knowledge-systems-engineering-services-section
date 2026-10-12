(local util (require :util))

(local thing (require :thing))

(lambda make [?file-name ?name ?base ?default]
  "Return a data-handler based on ?BASE (or a new thing) whose data (?DEFAULT if provided) is named ?NAME (or data) and saved at ?FILE-NAME (or data). If the data-handler has a folder-name, the data is saved under that folder. I.e. (make :foobert-log :log {:folder-name :user-data} []) makes a data-handler with functions load-log and save-log, which save, to start with, [] to user-data/foobert-log.fnl."
  (let [handler (or ?base (thing.make))
        name (or ?name :data)
        name-file (.. name :-file)
        file-name (or ?file-name name)
        file (if (. handler :folder-name)
                 (.. handler.folder-name :/ file-name)
                 file-name)
        default (or ?default nil)
        I (util.make-string-inserters name)]
    (handler:set-attributes
     {name-file file
      (I.P :load-) (lambda load-data [handler ?file ?default]
                     (util.load-data (or ?file (. handler name-file))
                                     (or ?default default)))
      (I.P :save-) (lambda save-data [handler data ?file]
                     (util.save-data data (or ?file
                                              (. handler name-file))))})
    handler))

{: make}

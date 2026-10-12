(local util (require :util))

(local thing (require :thing))
(local data-handler (require :data-handler))

(lambda make [?file-name ?name ?base]
  "Return a dictionary, a data handler whose data is a table."
  (local name (or ?name :dictionary))
  (local file-name (or ?file-name name))
  (local dictionary (data-handler.make
                     file-name name
                     ?base {}))
  (local I (util.make-string-inserters name))
  (tset dictionary (I.I :submit- :-item)
        (lambda submit-dictionary-item [dictionary id item]
          (let [items (: dictionary (I.P :load-))]
            (tset items id item)
            (: dictionary (I.P :save-) items))))
  dictionary)

{: make}

(local util (require :util))

(local thing (require :thing))

(local dictionary (require :dictionary))

(lambda make-user-account-item [accountant name]
  {:creation-time (os.time)
   :name name
   :password (util.make-id)
   :roles [:duckling]})

(lambda make [?file-name ?name ?base]
  (local name (or ?name :user-accounts))
  (local file-name (or ?file-name name))
  (local user-accountant
         (dictionary.make file-name name ?base))
  (local I (util.make-string-inserters name))
  ;; TODO user-accountant maker doesn't properly generalize function names
  (tset user-accountant (I.I :make- :-item) make-user-account-item)
  user-accountant)

{: make}

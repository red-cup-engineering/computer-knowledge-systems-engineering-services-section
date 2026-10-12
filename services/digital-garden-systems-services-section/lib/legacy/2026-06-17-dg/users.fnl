(local util (require :util))

(lambda load [users]
  (set users.list (util.load-data :user-list [])))

(lambda make-user [users name]
  (local user {: name
               :pass (util.make-id)})
  (table.insert users.list user)
  (users:save)
  user)

(lambda save [users]
  (util.save-data users.list :user-list))

{:list []
 : load
 : make-user
 : save}

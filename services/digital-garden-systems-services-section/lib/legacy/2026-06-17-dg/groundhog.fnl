(local util (require :util))

(local commands {})
(lambda commands.register-user [client input]
  (local user (client.engine.users:make-user input))
  (client:message (.. "Account named " input " made, pass is " user.pass)))
(lambda commands.change-area [client input]
  (let [(attribute value) (input:match "([^ ]+) ?(.*)")]
    (if (= attribute :name)
        (set client.location.name value)
        (if (= attribute :description)
            (set client.location.description value)
            (client:message "Invalid attribute, can only change name or description."))))
  (client.location:save))
(lambda commands.make-area [client input]
  (local new-area (client.engine.map:spawn-area
                   (client.engine.map:make-area)))
  (new-area:activate client.engine.map)
  (tset client.location.exits input new-area.id)
  (tset new-area.exits :back client.location.id)
  (client.location:save)
  (new-area:save)
  (client:message (.. "You made a new area, accessible through the "
                      input " exit. (id #" new-area.id ")")))

                            

(lambda apply [client]
  (client.engine:schedule
   (fn []
     (set client.size 3)
     (util.add-values client.commands commands))))

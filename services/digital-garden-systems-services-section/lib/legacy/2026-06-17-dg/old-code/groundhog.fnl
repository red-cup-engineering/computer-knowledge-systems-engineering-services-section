(lambda register [client input]
  (local new-account
         (client.dimension:make-user-account input))
  (client:append-mud-output
   (.. "New account made, password is " new-account.password))
  (client.dimension:submit-user-account input new-account))

(lambda change-area-name [client input]
  (local area client.location)
  (set area.name input)
  (area:save-area))

(lambda make [client]
  (each [cmd func (pairs {: register
                          : change-area-name})]
    (tset client.mud-commands cmd func))
  client)

{: make}

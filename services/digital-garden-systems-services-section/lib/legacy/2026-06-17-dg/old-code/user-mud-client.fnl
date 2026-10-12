(lambda login [client input]
  (local user-accounts (client.dimension:load-user-accounts))
  (var matched? nil)
  (let [(user pass) (input:match "([^ ]+) ?(.*)")]
    (each [id profile (pairs user-accounts)]
      (when (and (= user id)
               (= pass (. profile :password)))
        (set matched? profile)))
    (if matched?
        (do
          (set client.mud-commands.login nil)
          (each [key value (pairs matched?)]
            (tset client key value))
          (each [_ role (pairs client.roles)]
            (let [role-maker (. (require role) :make)]
              (role-maker client)))
          (client:append-mud-output (.. "Logged in as " client.name)))
        (do
          (client:append-mud-output "Invalid username or password.")))))

(lambda make [client]
  (tset client.mud-commands :login login)
  client)

{: make}

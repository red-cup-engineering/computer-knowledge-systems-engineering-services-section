(local util (require :util))

(local commands {})
(lambda commands.commands [client input]
  (client:message
   (.. "You have access to the following commands: "
       (util.quibble-strings (util.collect-keys client.commands) true))))
(lambda commands.login [client input]
  (local user-list client.engine.users.list)
  (var matched? nil)
  (let [(user pass) (input:match "([^ ]+) ?(.*)")]
    (each [_ profile (pairs user-list)]
      (when (and (= user profile.name)
               (= pass profile.pass))
        (set matched? profile))))
    (if matched?
      (do (set client.commands.login nil)
          (util.add-values client matched?)
          (let [role-funcs []]
            (each [_ role (pairs client.roles)]
              (table.insert role-funcs (util.load-data role)))
            (each [_ func (pairs role-funcs)]
              (func client)))
          (client:message (.. "Logged in as " client.name)))
      (client:message "Invalid user-name or pass.")))
(lambda commands.look [client input]
  (if (not (= input ""))
      (let [matches []]
        (client:message (.. "You attempt to look at '" input "."))
        (when client.location (client.location:search-area input matches))
        (if (= (length matches) 1)
            (client:look (. matches 1))
            (if (> (length matches) 1)
                (client:message "Multiple matches.")
                (client:message "No match."))))
      (if client.location (do
                            (client:message "You look around the area.")
                            (client:look client.location))
          (client:message "You aren't anyplace."))))
(lambda commands.move [client input]
  (if (not (= input ""))
      (let [exit (. client.location.exits input)]
        (if exit (do
                   (client:move (. client.engine.map.areas exit))
                   (client:look client.location))
            (client:message "Invalid exit")))
      (client:message "Include exit name")))
(lambda commands.who [client input]
  (client:message
   (.. "There are " (length client.engine.server.clients)
       " clients currently connected to the server.")))
(lambda commands.whoami [client input]
  (client:message
   (.. "Your name is " (or client.name :unknown) ".")))

(lambda activate [client server connection]
  (set client.commands (util.clone-table client.commands))
  (set client.engine server.engine)
  (set client.connection connection)
  (client:move (. client.engine.map.areas client.engine.map.start-area)))

(lambda disconnect [client]
  (util.remove-value client.dimension.server.clients client))

(lambda look [client thing]
  (client:message (.. "You look at " (or thing.name "the thing") "."))
  (local A (util.make-string-appender "\n"))
  (when thing.name (A thing.name))
  (when thing.description (A (.. "  " thing.description)))
  (when thing.contents
    (let [content-listing (util.quibble-strings
                           (icollect [_ item (pairs thing.contents)]
                             (when (and item.name item.size (> item.size 0))
                               item.name)))]
      (when content-listing (A (.. "Contents: " content-listing)))))
  (when thing.exits
    (A (.. "Exits: "
           (util.quibble-strings (util.collect-keys thing.exits) true))))
  (if (not (= (A) ""))
      (client:message (A))
      (client:message "Cannot see thing.")))

(lambda message [client message]
  (set client.output (.. client.output message "\n")))

(lambda move [client area]
  (client:message (.. "You move to " area.name))
  (area:receive-object client))

(lambda parse [client input]
  (let [(command line) (input:match "([^ ]+) ?(.*)")]
    (var matched? nil)
    (each [key func (pairs client.commands)]
      (when (= command key)
        (set matched? true)
        (func client line)))
    (when (not matched?)
      (client:message "Invalid command; `commands` to list available commands."))))

(lambda send-output [client]
  (client.connection:send client.output)
  (set client.output ""))

{:name :Anonymouse :size 0
 :output "" :input "" :location nil
 : activate
 : commands
 : disconnect
 : message
 : look
 : move
 : parse
 : send-output}

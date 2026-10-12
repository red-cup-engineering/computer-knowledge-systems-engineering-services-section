;;;; MUD client
;; a thing associated with a connection on the MUD server
(local util (require :util))

(local thing (require :thing))

(lambda default-mud-parser [client input]
  (let [(command line) (input:match "([^ ]+) ?(.*)")]
    (var matched? nil)
    (each [key func (pairs client.mud-commands)]
      (when (= command key)
        (set matched? true)
        (func client line)))
    (when (not matched?)
      (client:append-mud-output
       (.. "Invalid command. Input `commands` and press ENTER to "
           "see your available commands.")))))

(lambda append-mud-output [client message]
  (set client.mud-output (.. client.mud-output message "\n")))

(lambda parse-mud-input [client input]
  (client:mud-parser input))

(local commands {})
(lambda commands.commands [client input]
  (client:append-mud-output
   (.. "You've access to the following commands: "
       (util.quibble-strings
        (util.collect-keys client.mud-commands)
        true))))
(lambda commands.who [client input]
  (client:append-mud-output
   (.. "There are " (length client.mud-server.mud-clients)
       " clients currently connected.")))
(lambda commands.whoami [client input]
  (client:append-mud-output
   (.. "Your name is " (or client.name :unknown) ".")))

(lambda make [server connection ?base]
  "Return a MUD client associated with CONNECTION and SERVER, built off the ?BASE thing if its provided."
  (local client (or ?base (thing.make)))
  (client:set-attributes {:name :Anonymouse
                          :mud-connection connection
                          :mud-server server
                          :mud-output "" :mud-input ""
                          :mud-commands commands
                          :mud-parser default-mud-parser
                          : append-mud-output
                          : parse-mud-input})
  client)

{: make}

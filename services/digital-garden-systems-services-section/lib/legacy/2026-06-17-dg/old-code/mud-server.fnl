;;;; MUD Server
;; beside the REPL, this is the primary way of interacting with the digital garden.
;; it's a basic socket server, aspiring to someday be a TELNET server with fancy stuff like MXP. But for now, it is what it is.
(local socket (require :socket))

(local util (require :util))

(local thing (require :thing))
(local mud-client (require :mud-client))

(lambda accept-mud-server-connection [server connection]
  (local client (if server.dimension
                    (server.dimension:make-thing)
                    (thing.make)))
  (mud-client.make server connection client)
  (client.mud-connection:settimeout server.mudsocket-timeout)
  (each [_ maker (pairs server.mud-client-makers)]
    (let [make (. (require maker) :make)]
      (make client)))
  (table.insert server.mud-clients client)
  (server:send-mud-server-new-client-message client))

(lambda disconnect-mud-server-client [server client]
  (util.remove-value server.mud-clients client)
  (client:destroy))

(lambda send-mud-server-new-client-message [server client]
  (client:append-mud-output
   (.. "You have connected to "
       (if server.name server.name
           (if (and server.dimension
                    server.dimension.name)
               server.dimension.name
               "a server."))
       "\nInteract by inputting `commands` and pressing ENTER."
       (if client.mud-commands.client
           "Use `commands` to see a list of your available commands."
           ""))))

(lambda start-mud-server [server]
  ;; bind the server to port 4242 by default
  (set server.mudsocket
       (assert (socket.bind "0.0.0.0"
                            (or server.mudsocket-port 4242))))
  (server.mudsocket:settimeout (or server.mudsocket-timeout 0.001))
  ;; if the server is in a temporal dimension, schedule its tick function
  (when (and server.dimension server.dimension.schedule-event)
    (server.dimension:schedule-event
     (partial server.tick-mud-server server true))))

(lambda tick-mud-server [server ?repeat]
  ;; accept any new connection (just one per tick? dunno)
  (let [new-connection (server.mudsocket:accept)]
    (when new-connection
      (server:accept-mud-server-connection new-connection)))
  ;; parse any client input and send them their output
  (each [_ client (pairs server.mud-clients)]
    (match (client.mud-connection:receive)
      (nil msg) (when (= msg :closed)
                  (server:disconnect-mud-server-client client))
      input (client:parse-mud-input input))
    (when (not (= client.mud-output ""))
      (client.mud-connection:send client.mud-output)
      (set client.mud-output "")))
  (when ?repeat
    (server.dimension:schedule-event
     (partial server.tick-mud-server server ?repeat))))

(lambda make [?port ?client-makers ?base]
  (local server (or ?base (thing.make)))
  (server:set-attributes {:mudsocket-port (or ?port 4242)
                          :mudsocket-timeout 0.001
                          :mud-clients []
                          :mud-client-makers (or ?client-makers [])
                          : accept-mud-server-connection
                          : disconnect-mud-server-client
                          : send-mud-server-new-client-message
                          : start-mud-server
                          : tick-mud-server})
  server)

{: make}

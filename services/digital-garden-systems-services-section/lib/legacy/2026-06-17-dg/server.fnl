(local util (require :util))

(local client (require :client))

(lambda send-connection-message [client]
  (local A (util.make-string-appender "\n"))
  (A "You've connected to a the Groundhog Autonomous Zone Multi-User Dimension (GAZ-MUD).")
  (A "To interact, input commands and press ENTER.")
  (A "Useful commands: `look` to see where you are, `commands` for a list of commands.")
  (A "  ( don't type the ` )")
  (A "This MUD is created for participants in the GAZ, but is occasionally open to the Web. Please be aware, this place is new, and might fall apart if you poke it too hard.")
  (client:message (A)))

(lambda accept-connection [server connection]
  (connection:settimeout 0.01)
  (local client (util.clone-table client))
  (client:activate server connection)
  (table.insert server.clients client)
  (send-connection-message client))

(lambda start [server engine]
  (set server.engine engine)
  (set server.mudsocket (assert (util.socket.bind "0.0.0.0" 4242)))
  (server.mudsocket:settimeout 0.01)
  (engine:schedule (partial server.tick server)))

(lambda tick [server]
  (let [new-conn (server.mudsocket:accept)]
    (when new-conn (accept-connection server new-conn)))
  (each [_ client (pairs server.clients)]
    (match (client.connection:receive)
      (nil msg) (when (= msg :closed)
                  (client:disconnect))
      input (client:parse input))
    (when (not (= client.output ""))
      (client:send-output)))
  (server.engine:schedule (partial server.tick server)))

{:clients []
 : start
 : tick}

(local socket (require :socket))
(local fennel (require :fennel))
(local util {})
(lambda util.collect-keys [tbl]
  "Return a list of the keys in TBL."
  (icollect [key _ (pairs tbl)] key))
(lambda util.find-key [seq query]
  (each [key val (pairs seq)]
    (when (= val query) key)))
(lambda util.make-string-appender [?sep]
  "Return a function that holds a string and accepts one atctional argument (string or list of strings). If provided, the argument is appended to the held string, with SEP appended (to each one, if its a list of strings.)"
  (var o "")
  (lambda [?a]
    (lambda q [r]
      (set o (.. o r (or ?sep ""))) o)
    (if ?a
        (if (= (type ?a) :string)
              (q ?a)
              (each [_ v (pairs ?a)]
                (q v)))
        o)))
(lambda util.quibble-strings [strings ?resort ?oxfordize]
  "Return the sequence of STRINGS separated with commas and the conjunction 'and'. ?OXFORDIZE is currently irrelevant; strings are oxfordized by defualt."
  (let [oxfordize (or ?oxfordize true)
        o (util.make-string-appender)]
    (when ?resort (table.sort strings))
    (var join "")
    (for [count 1
          (length strings) 1]
      (if (= count (length strings))
          (set join "")
          (= count (- (length strings) 1))
          (set join
               (.. (if (and oxfordize
                            (> (length strings) 2))
                       ","
                       "")
                   " and "))
          (set join ", "))
      (o [(. strings count) join]))
    (o)))                           
(local mud-server {:port 4242 :timeout 0.001 :clients []})
(lambda mud-server.make-client [server connection]
  (let [client {:name :Anonymouse
                :connection connection :server server
                             :input "" :output "" :commands {}}]
    (lambda client.parser [client input]
      (let [(command line) (input:match "([^ ]+) ?(.*)")]
        (var matched? nil)
        (each [key func (pairs client.commands)]
          (when (= command key)
            (set matched? true)
            (func client line)))
        (when (not matched?)
          (client:append-output "Invalid command."))))
    (lambda client.append-output [client message]
      (set client.output
           (.. client.output message "\n")))
    (lambda client.move [client destination]
      (if destination.contents
          (do
            (when client.location
              (table.remove
               client.location.contents
               (util.find-key client.location.contents client)))
            (table.insert destination.contents client)
            (set client.location destination)
            (client:append-output
             (.. "You move"
                 (if destination.name
                     (.. " to " destination.name)
                     "."))))
          (if destination.exits
              (do (set destination.contents [])
                  (client:move destination))
              (print "Move failed! destination doesnt seem to be an area."))))
    (lambda client.parse-input [client input]
      (client:parser input))
    (lambda client.commands.commands [client input]
      (client:append-output
       (.. "You have access to the following commands: "
           (util.quibble-strings (util.collect-keys client.commands) true))))
    (lambda client.commands.look [client input]
      (client:append-output
       (if client.location
           (let [l client.location]
             (.. (if l.name (.. l.name "\n") "")
                 (if l.description (.. l.description "\n")
                     "You cannot see this place.")
                 (if l.exits
                     (.. "Exits: "
                         (util.quibble-strings
                          (util.collect-keys l.exits) true)
                         "\n"))))
           "You aren't anyplace. Strange!")))
    (lambda client.commands.move [client input]
      (let [(direction _) (input:match "([^ ]+) ?(.*)")]
        (var matched? nil)
        (let [destination (. client.location.exits direction)]
          (if destination
              (client:move destination)
              (client:append-output "Invalid direction.")))))
    (lambda client.commands.who [client input]
      (client:append-output
       (.. "There are " (length client.server.clients)
           " clients currently connected to the server.")))
    (lambda client.commands.whoami [client input]
      (client:append-output
       (.. "Your name is " (or client.name :unknown) ".")))
    client))
(lambda mud-server.accept-connection [server connection]
  (connection:settimeout server.timeout)
  (let [client (server:make-client connection)]
    (table.insert server.clients client)
    (server:send-connection-message client)
    (when server.spawn-room
      (fennel.view server.spawn-room)
      (client:move server.spawn-room))))
(lambda mud-server.disconnect-client [server client]
  (each [key value (pairs server.clients)]
    (when (= value client.connection)
      (server.clients:remove key))))
(lambda mud-server.send-connection-message [server client]
  (let [msg (.. "You've connected to a server")]
    (client:append-output msg)))
(lambda mud-server.start [server ?spawn-room]
  (set server.mudsocket (assert (socket.bind "0.0.0.0" server.port)))
  (when ?spawn-room
    (set server.spawn-room ?spawn-room))
  (server.mudsocket:settimeout server.timeout))
(lambda mud-server.tick [server ?timer]
  (let [new-conn (server.mudsocket:accept)]
    (when new-conn (server:accept-connection new-conn)))
  (each [_ client (pairs server.clients)]
    (match (client.connection:receive)
      (nil msg) (server:disconnect-client client)
      input (client:parse-input input))
    (when (not (= client.output ""))
      (client.connection:send client.output)
      (set client.output "")))
  (when ?timer (?timer:schedule-event (partial server.tick server ?timer))))
(local timer {:tick-rate 0.02 :tick-count 0 :events []})
(lambda timer.run [timer]
  (timer:tick)
  (socket.select nil nil timer.tick-rate)
  (timer:run))
(lambda timer.schedule-event [timer event]
  (table.insert timer.events event))
(lambda timer.tick [timer]
  (set timer.tick-count (+ timer.tick-count 1))
  (let [current-events timer.events]
    (set timer.events [])
    (each [_ event (pairs current-events)] (event))))
;; mapping?
;; make region, make areas, populate areas, stitch exits together, add animation
(local make {})
(lambda make.area [definition]
  (let [area definition]
    (when (not area.exits) (set area.exits {}))
    (when (not area.contents) (set area.contents []))
    area))
(lambda make.region [definition]
  (let [region definition]
    (when region.areas
      (each [area-id area-definition (pairs region.areas)]
        (let [area (make.area area-definition)]
          (when area.contents
            (each [_ item (pairs area.contents)]
              (when (and item.type
                         (. make item.type))
                ((. make item.type) item))))
          (when region.trivia
            (when (not area.trivia) (set area.trivia []))
            (each [_ trivium (pairs region.trivia)]
              (table.insert area.trivia trivium)))
          (tset region.areas area-id area))))
    (when region.stitch (region:stitch))
    region))
(local map {:central-plains {:areas {}}
            :cut {:areas {}}
            :farsteppes {:areas {}}
            :gloaming {:areas {}}
            :green-delta {:areas {}}
            :halfling-country {:areas {}}})
(set map.central-plains.trivia
       ["Dwarves began to settle the Central Plains around 1200bB"])
(set map.central-plains.areas.east-kingsroad
     {:name :Kingsroad
      :description "This is the Kingsroad, toward the eastern boundary of the Central Plains. To the east are the Farsteppes, and to the west are the Central Plains, and beyond that the Green Delta."})
(set map.central-plains.areas.fort-kelly
       {:name "Fort Kelly"
        :description (.. "This is Fort Kelly, a human outpost in the central "
                         "Central Plains. Despite the name, it doesn't appear "
                         "to be much of a fort. It's mostly a congregation of "
                         "tents flanking the Kingsroad, though a larger "
                         "sandstone structure is being constructed on the east "
                         "side of the \"fort\". There is also an odd swirl "
                         "right off the road.")
        :trivia [(.. "Fort Kelly was the first settlement the Red Union "
                     "established outside the Green Delta.")]
        :contents [{:name :tents
                    :description (.. "Most of the tents here are square and "
                                     "canvas. Most have large letters and "
                                     "numbers stenciled on their sides: tents "
                                     "north of the Kingsroad seem to have "
                                     "odd-numbers, with those south being "
                                     "even-numbered. Each number is preceded "
                                     "by a letter, M, R or W.")
                    ;; materials, residential, or workshop
                    }]})
(set map.central-plains.areas.west-kingsroad-1
     {:name :Kingsroad
      :description "This is the Kingsroad nearly halfway through the Central Plains. To the east is Fort Kelly, and to the west the Kingsroad stretches on toward the Green Delta."})
(set map.central-plains.areas.west-kingsroad-2
     {:name :Kingsroad
      :description "This is the Kingsroad where the Green Delta and Central Plains meet. The Central Plains extend seemingly forever to the east. To the west, the road stretches toward the human city of Ack."})
(lambda map.central-plains.stitch [plains]
  (let [A plains.areas
        ek A.east-kingsroad eke ek.exits
        fk A.fort-kelly fke fk.exits
        wk1 A.west-kingsroad-1 wk1e wk1.exits
        wk2 A.west-kingsroad-2 wk2e wk2.exits]
    (set eke.west fk)
    (set fke.east ek) (set fke.west wk1)
    (set wk1.east fk) (set wk1.west wk2)
    (set wk2.east wk1))) 
(lambda start []
  (let [world {:central-plains (make.region map.central-plains)}]
    (tset mud-server :spawn-room world.central-plains.areas.east-kingsroad)
    (mud-server:start)
    (timer:schedule-event (partial mud-server.tick mud-server timer))))
(lambda run []
  (timer:run))
{: map : mud-server : timer : start : run}

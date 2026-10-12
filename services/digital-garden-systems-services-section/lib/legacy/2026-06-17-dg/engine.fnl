(local util (require :util))

(local server (require :server))
(local talker (require :talker))
(local users (require :users))
(local map (require :map))

(lambda log [level message]
  (print (.. level ": " message)))

(lambda run [engine]
  (engine:tick)
  (util.socket.select nil nil 0.2)
  (engine:run))

(lambda schedule [engine event]
  (table.insert engine.events event))

(lambda start [engine]
  (engine.users:load)
  (engine.map:start)
  (engine.talker:start engine)
  (engine.server:start engine))
  
(lambda tick [engine]
  (set engine.tick-count (+ engine.tick-count 1))
  (local events engine.events)
  (set engine.events [])
  (each [_ event (pairs events)]
    (event)))


{ :events [] :tick-count 0
 : log
 : run : schedule : start : tick
 : map : server : talker : users}

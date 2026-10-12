(local socket (require :socket))

(local thing (require :thing))

(lambda run-time [timer]
  "Makes TIMER tick-time, then wait for its tick-rate, then recalls this function."
  (timer:tick-time)
  (socket.select nil nil (or timer.tick-rate 0.2))
  (timer:run-time))

(lambda tick-time [timer]
  (set timer.tick-count (+ timer.tick-count 1))
  (let [current-events timer.events]
    (set timer.events []) ; reset the event queue
    (each [_ event (pairs current-events)]
      (event))))

(lambda schedule-event [timer event]
  "Appends EVENT (function) to the end of TIMER's scheduled events."
  (table.insert timer.events event))

(lambda make [?base ?tick-rate]
  (local timer (or ?base (thing.make)))
  (timer:set-attributes {:tick-count 0
                         :tick-rate (or ?tick-rate 0.2)
                         :events []
                         : run-time : tick-time
                         : schedule-event})
  timer)
    
{: make}

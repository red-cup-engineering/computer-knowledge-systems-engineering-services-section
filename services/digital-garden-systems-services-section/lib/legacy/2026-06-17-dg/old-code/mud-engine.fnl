(local util (require :util))

(local thing (require :thing))
(local user-accountant (require :user-accountant))

(local dimension (require :dimension))

(local map (require :map))

(local mud-server (require :mud-server))
(local user-mud-client (require :user-mud-client))
(local rpg-mud-client (require :rpg-mud-client))

(lambda make [?name ?port ?user-accounts ?map ?spawn-room ?client-makers]
  (local engine (thing.make {:name (or ?name nil)}))
  (when ?user-accounts
    (user-accountant.make
     ?user-accounts :user-accounts engine))
  (dimension.make engine)
  (mud-server.make (or ?port 4242)
                   (or ?client-makers
                       (if ?user-accounts [:user-mud-client]
                           []))
                   engine)
  (when ?map
    (set engine.map (map.make ?map :map (engine:make-thing))))
  (engine:set-attributes
   {: util
    :start-mud-engine (lambda [engine]
                        (when (. engine :map) (engine.map:start-map)
                              (if ?spawn-room
                                  (set engine.spawn-room
                                       (. engine.map.map ?spawn-room))
                                  (set engine.spawn-room
                                       (util.random-value engine.map.map))))
                        (engine:start-mud-server))
    :run-mud-engine (lambda [engine] (engine:run-time))})
  engine)

{: make}

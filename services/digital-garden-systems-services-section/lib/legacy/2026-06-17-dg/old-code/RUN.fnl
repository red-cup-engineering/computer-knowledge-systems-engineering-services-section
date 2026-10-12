(local engine ((. (require :mud-engine) :make)
               "emsenn's digital garden" ; name
               4242 ;port
               :data/user-accounts ; user-account file location
               :data/map ; map file location
               :2621f38d ; spawn-room ID
               [:rpg-mud-client :user-mud-client] ; MUD-client makers
               ))

(engine:start-mud-engine)
(engine:run-mud-engine)

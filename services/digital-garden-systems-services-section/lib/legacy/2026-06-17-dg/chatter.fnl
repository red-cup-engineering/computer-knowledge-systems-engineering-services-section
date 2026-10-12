(local util (require :util))

(local commands {})
(lambda commands.chat [client input]
  (local talker client.engine.talker)
  (talker:broadcast client input))

(lambda apply [client]
  (client.engine:schedule
   (fn []
     (util.add-values client.commands commands))))

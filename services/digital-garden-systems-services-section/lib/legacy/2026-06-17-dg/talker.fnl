(local util (require :util))

(lambda broadcast [talker chatter message]
  (each [_ client (pairs talker.engine.server.clients)]
    (var matched 0)
    (each [_ role (pairs client.roles)]
      (when (= role :chatter) (set matched 1)))
    (when (> matched 0)
      (client:message (.. "[chat] " chatter.name ": " message)))))

(lambda start [talker engine]
  (set talker.engine engine))

{: broadcast
 : start}

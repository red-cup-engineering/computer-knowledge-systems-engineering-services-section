(local util (require :util))

(local thing (require :thing))

(local object (require :object))

(lambda make [client]
  (object.make client.dimension.spawn-room :client "This is a client" client)
  (set client.size 3)
  (lambda client.look [client thing]
    (local A (util.make-string-appender "\n"))
    (when thing.name (A thing.name))
    (when thing.description (A (.. "  " thing.description)))
    (when thing.contents
      (let [content-listing (util.quibble-strings
                             (icollect [_ item (pairs thing.contents)]
                               (when (and item.name item.size (> item.size 0))
                                 item.name)))]
        (when content-listing (A (.. "Contents: " content-listing)))))
    (when thing.exits
      (A (.. "Exits: "
             (util.quibble-strings (util.collect-keys thing.exits) true))))
    (if (not (= (A) ""))
        (client:append-mud-output (A))
        (client:append-mud-output "Cannot see thing.")))
  (lambda client.mud-commands.look [client input]
    (if (not (= input ""))
        (let [matches []]
          (if client.location (client.location:search-area input matches))
          (if (= (length matches) 1)
              (client:look (. matches 1))
              (if (> (length matches) 1)
                  (client:append-mud-output "Multiple matches.")
                  (client:append-mud-output "No match."))))
        (if client.location (client:look client.location)
            (client:append-mud-output "You aren't anyplace."))))
  client)

{: make}

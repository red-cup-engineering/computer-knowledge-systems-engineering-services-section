(local util (require :util))

(lambda activate [area map]
  (when (not area.contents) (set area.contents []))
  (when (not area.exits) (set area.exits {}))
  (set area.map map)
  (tset area.map.areas area.id area))

(lambda receive-object [area object]
  (when object.location
    (object.location:remove-object object area))
  (table.insert area.contents object)
  (set object.location area))

(lambda remove-object [area object destination]
  (set area.contents (util.remove-value area.contents object))
  (each [_ thing (pairs area.contents)]
    (when (. thing :message)
      (thing:message (.. object.name " moved "
                         (if destination (.. "to " destination.name) "elsewhere")
                         "."))))
  (set object.location nil))

(lambda save [area]
  (local map-data (area.map:load))
  (tset map-data area.id {:id area.id
                          :name area.name
                          :description area.description
                          :exits area.exits})
  (area.map:save map-data))

(lambda search-area [area query ?matches]
  (local matches (or ?matches []))
  (lambda search [seq]
    (each [_ item (pairs seq)]
      (when (and item.name (= item.name query))
        (table.insert matches item))))
  (search area.contents))
  

{: activate
 : receive-object
 : remove-object
 : save
 : search-area}

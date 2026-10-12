;;;; area
;; An area represents an abstract amount of space in which objects can exist. It might represent a starsystem, a bathroom, or a sector of ocean.

(local util (require :util))

(local thing (require :thing))

(local container (require :container))

(lambda receive-object [area object]
  (table.insert area.contents object)
  (set object.location area))

(lambda remove-object [area object]
  (util.remove-value area.contents object)
  (set object.location nil))

(lambda save-area [area]
  (local map area.map)
  (map:submit-map-item
   (map:make-map-item area.name area.description)))

(lambda search-area [area query ?matches]
  (local matches (or ?matches []))
  (lambda search [seq]
    (each [_ item (pairs seq)]
      (when (and item.name (= item.name query))
        (table.insert matches item))))
  (search area.contents) (search area.lookables)
  matches)

(lambda make [?map-item ?base]
  (local area (container.make ?base))
  (when ?map-item (area:set-attributes ?map-item))
  (area:set-attributes {: receive-object
                        : remove-object
                        : save-area
                        : search-area})
  area)

{: make}

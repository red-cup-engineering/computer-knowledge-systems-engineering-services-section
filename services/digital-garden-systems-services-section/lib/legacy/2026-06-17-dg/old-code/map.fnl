(local util (require :util))

(local thing (require :thing))

(local dictionary (require :dictionary))

(local area (require :area))

(lambda make [?file-name ?name ?base]
  (local name (or ?name :map))
  (local file-name (or ?file-name name))
  (local map (dictionary.make file-name name ?base))
  (local I (util.make-string-inserters name))
  (local make-thing (if map.dimension (partial map.dimension.make-thing map.dimension)
                   thing.make))
  (tset map name {})
  (tset map (I.I :make- :-item)
        (lambda make-map-item [map ?item-name ?item-description]
          {:id (util.make-id (util.collect-keys (: map (I.P :load-))))
           :creation-time (os.time)
           :name (or ?item-name :area)
           :description (or ?item-description "This is an area.")}))
  (tset map (I.P :start-)
        (lambda start-map [map]
          (each [id map-item (pairs (: map (I.P :load-)))]
            (let [area (area.make map-item (make-thing))]
              (lambda area.save-area [area]
                (map:submit-map-item
                 area.id
                 (map:make-map-item
                  area.name area.description)))
              (tset (. map name) id area)))))
  map)

{: make}

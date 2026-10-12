(local thing (require :thing))

(lambda move [object location]
  (location:receive-object object))

(lambda make [location ?name ?description ?base]
  (local object (or ?base (thing.make)))
  (object:set-attributes {:name (or ?name :object)
                          :description (or ?description "This is an object.")
                          : move})
  (let [old-destroy object.destroy]
    (lambda object.destroy [object]
      (when object.location (object.location:remove-object object))
      (old-destroy object)))
  (object:move location))

{: make}

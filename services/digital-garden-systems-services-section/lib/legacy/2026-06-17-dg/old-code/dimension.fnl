;;; dimension
;; a maker and a timer combined give us a dimension
;;   stuff  +    change            =      everything

(local util (require :util))

(local thing (require :thing))

(local timer (require :timer))
(local maker (require :maker))

(lambda destroy [thing]
  (util.remove-value thing.dimension.things thing))

(lambda make [?base]
  "Return a dimension (built on ?BASE, if provided), a combination of a maker and timer."
  (local dim (or ?base (thing.make)))
  (when (not dim.dimension) (set dim.dimension dim))
  (when (not dim.schedule-event) (timer.make dim))
  (when (not dim.make-thing) (maker.make dim))
  (let [old-make-thing dim.make-thing]
    (lambda dim.make-thing [dimension ?attributes]
      (local thing (old-make-thing dim ?attributes))
      (set thing.dimension dim)
      (set thing.destroy destroy)
      thing))
  dim)

{: make}

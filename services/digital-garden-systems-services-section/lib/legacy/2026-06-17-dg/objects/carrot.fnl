(lambda sow [seed bed]
  (if (= bed.type :garden-bed)
      (do
        (set seed.bed bed)
        (set seed.name (.. "sown " seed.name))
        (set seed.stage :sown)
        (tset seed.timeline :sown (os.time))
        (bed:receive-seed seed)) ; needs to save itself in its area, yo!
      (print "tried to sow " seed.name " in " bed.name " which isn't a bed.")))

(lambda sprout [seed]
  (set seed.stage :sprouted)
  ;; more coming sometime
  )

(lambda grow [seed]
  (let [stage seed.stage]
    (when (= stage :seed)
      nil)
    (when (= stage :sown)
      (if (> (* 86400 (- seed.days-to-sprout (* seed.days-to-sprout 0.2)))
             (- (os.time) seed.timeline.sown))
          (seed.bed.steward:query
           (.. "Have the " seed.name " in " seed.bed.name " sprouted?")
           sprout)))))

{:name "carrot seeds"
 :description "This is some carrot seed. I'm not up to describing it right now, but they're fairly pretty!"
 :stage :seed
 :days-to-sprout 6
 :days-to-mature 60
 :soil-temp-min :X
 :soil-temp-max :X
 :mass 0.02
 : grow : sow : sprout}

(lambda sow [seed bed]
  (if (= bed.type :garden-bed)
      (do
        (set seed.name (.. "sown " seed.name))
        (tset seed.timeline :sown (os.time)) 
        (bed:receive-seed seed))
      (print "tried to sow " seed.name " in " bed.name " which isn't a bed.")))

(lambda germinate [seed]
  (print "Something triggered a carrot seed's germination function. If you expected more function than a console message, lol."))

(lambda grow [seed]

{:name "carrot seeds"
 :description "This is some carrot seed. I'm not up to describing it right now, but they're fairly pretty!"
 :days-to-sprout 6
 :days-to-mature 60
 :soil-temp-min :X
 :soil-temp-max :X
 :mass 0.02
 : germinate}

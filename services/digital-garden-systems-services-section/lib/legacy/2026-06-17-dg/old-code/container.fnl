(local thing (require :thing))

(lambda make [?base]
  (local container (or ?base (thing.make)))
  (set container.contents [])
  container)

{: make}

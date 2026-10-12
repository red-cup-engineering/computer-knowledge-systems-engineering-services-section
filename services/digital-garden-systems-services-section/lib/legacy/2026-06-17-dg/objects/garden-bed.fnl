(lambda activate [bed]
  (when (not bed.contents) (set bed.contents [])))

(lambda receive-seed [bed seed]
  (table.insert bed.contents seed))

{:name "a garden bed"
 :description "This is a garden bed."}

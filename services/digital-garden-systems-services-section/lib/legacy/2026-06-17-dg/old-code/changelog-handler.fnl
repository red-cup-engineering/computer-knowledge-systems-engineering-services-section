(local util (require :util))

(local log-handler (require :log-handler))

(lambda make [?file-name ?name ?base]
  "Return a changelog-handler based on ?BASE (if provided) and a log-handler whose name is, by default, changelog. The changelog-handler also has make-changelog-entry for making well-formatted entries, and render-changelog and render-changelog-entries for presenting the changelog in a more human-friendly way."
  (let [name (or ?name :changelog)
        file-name (or ?file-name name)
        changelogger (log-handler.make file-name name ?base)
        I (util.make-string-inserters name)]
    (changelogger:set-attributes
     {(I.I :make- :-entry)
      (lambda make-changelog-entry [logger author status element ?note]
                {:time (os.time)
         : author : status : element
         :note (or ?note nil)})
      (I.I :render- :-entry)
      (lambda render-changelog-entry [logger entry]
        (.. entry.status " " entry.element
            (if (. entry :note)
                (.. " (" entry.note ")")
                "")
            " [" entry.author " @ " (util.render-time entry.time) "]"))
      (I.P :render-)
      (lambda render-changelog [logger]
        (let [entries (: logger (I.P :load-))
              A (util.make-string-appender "\n")]h
          (each [_ entry (pairs entries)]
            (A (: logger (I.I :render- :-entry) entry)))
          (A)))})
    changelogger))

{: make}

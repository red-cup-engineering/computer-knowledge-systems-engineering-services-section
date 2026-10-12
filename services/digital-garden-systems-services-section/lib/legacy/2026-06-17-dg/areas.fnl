{:foyer {:description "This is the foyer to the GAZ-MUD; a quiet space where folk are encouraged to get situated before heading `out` into the wider MUD."
         :exits {:out "hub"}
         :id "foyer"
         :name "the foyer"}
 :hub {:description "This is the current hub of the GAZ-MUD. There is literally nothing here. Yet somehow, there is an exit to what is obviously the west, leading to the virtual makerspace."
       :exits {:west "virtual-makerspace" :north "library"}
       :id "hub"
       :name "the hub"}
 :virtual-makerspace {:description "This is the virtual makerspace of the GAZ-MUD, a place where those with the `maker` role are encouraged to mess around. Please note, if you don't have that role, while you're allowed to roam the space, you might get stuck."
                      :exits {:east "hub"}
                      :id "virtual-makerspace"
                      :name "the virtual makerspace"}
 :library {:description "This is the the GAZ library, or at least, its digital virtualization. In the corner, an assembly of philosophers are entangled in discourse about what the difference is."
           :exits {:south "hub"}
           :id "library"
           :name "the library"}
 :garden {:description "This is a virtualization of the GAZ garden. At the moment it is barrent except for a small area of land."
          :exits {:north "hub"}
          :id "garden"
          :name "the garden"}}

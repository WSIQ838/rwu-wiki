---
hide:
  - navigation
  - toc
---
# Network map

The Rail Works Universe line map. Drag to move, scroll or pinch to zoom, and click a station to open its page. To see who is driving right now, open the [live map](live.md).

<div class="rwu-sch" id="rwu-map">
  <div class="rwu-sch-btns"><button data-act="in" title="Zoom in">+</button><button data-act="out" title="Zoom out">&minus;</button><button data-act="fit" title="Show everything">&#9633;</button></div>
  <div class="rwu-sch-tip" id="rwu-map-tip" data-idle="Drag to move, scroll to zoom, click a station">Drag to move, scroll to zoom, click a station</div>
</div>

<link rel="stylesheet" href="../assets/map.css">
<script src="../assets/schematic.js"></script>
<script>
RWUSchematic.create(document.getElementById("rwu-map"), { base: "../" }).then(function (map) {
  map.addStationLinks(document.getElementById("rwu-map-tip"));
});
</script>

## To scale

The same network drawn to scale, with miles along the track from Union Station.

![Rail Works Universe network drawn to scale](assets/rwu-real-network-map.png)

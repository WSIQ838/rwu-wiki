// Rail Works Universe live map: who is playing and which train they are on, placed on the line map.
// The data comes from the game through the status server (see LIVE-FEED.md). Nothing is shown unless the feed answers.
(function () {
  var cfg = window.RWU_LIVE || {}, wrap = document.getElementById("rwu-live");
  if (!wrap) return;
  var demo = /[?&]demo\b/.test(location.search);
  var statusEl = document.getElementById("rwu-live-status"), tableEl = document.getElementById("rwu-live-table"), cardEl = document.getElementById("rwu-live-card");
  var COLORS = { ML: "#1d9be0", CL: "#20c7c0", EX: "#ff0a84", JR: "#f28a14" };
  var JOBS = { Operator: "Train Operator", StationStaff: "Station Staff" };
  var selected = null, map = null, layer = null;
  function td(tr, text) { var c = document.createElement("td"); c.textContent = text == null || text === "" ? "-" : text; tr.appendChild(c); return c; }
  function setStatus(kind, text) {
    statusEl.textContent = "";
    var dot = document.createElement("span"); dot.className = "rwu-live-dot " + kind; statusEl.appendChild(dot);
    statusEl.appendChild(document.createTextNode(text));
    if (demo) { var b = document.createElement("span"); b.className = "rwu-live-demo"; b.textContent = "Sample data, not real players"; statusEl.appendChild(b); }
  }
  function render(servers) {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    tableEl.textContent = "";
    var trains = [], people = [], used = {};
    servers.forEach(function (s, si) {
      (s.trains || []).forEach(function (t) { t._key = si + ":" + t.id; trains.push(t); });
      (s.people || []).forEach(function (p) { p._key = p.train ? si + ":" + p.train : null; people.push(p); });
    });
    var byKey = {};
    trains.forEach(function (t) {
      if (typeof t.x !== "number" || typeof t.z !== "number") return;
      var at = map.locate(t.x, t.z); if (!at) return;
      byKey[t._key] = t;
      // trains at the same spot are stacked so each can be read
      var slot = Math.round(at.x / 40) + ":" + Math.round(at.y / 40), n = used[slot] || 0; used[slot] = n + 1;
      var who = (t.people || []).filter(function (p) { return p.role === "Driver"; })[0] || (t.people || [])[0];
      var label = who ? String(who.name) : String(t.name || t["class"] || "Train");
      var g = map.el("g", { "class": "rwu-train" + (selected === t._key ? " sel" : ""), transform: "translate(" + at.x + "," + (at.y - n * 44) + ")" }, layer);
      var w = label.length * 13 + 26;
      map.el("rect", { x: 20, y: -19, width: w, height: 38, rx: 19 }, g);
      var tx = map.el("text", { x: 33, y: 8 }, g); tx.textContent = label;
      map.el("circle", { r: 15, fill: COLORS[String(t["class"] || "").slice(0, 2)] || "#ffffff" }, g);
      g.addEventListener("click", function () { selected = t._key; render(servers); });
    });
    var head = document.createElement("tr");
    ["Player", "Doing", "Train", "Going to", "Next stop", "Speed"].forEach(function (h) { var c = document.createElement("th"); c.textContent = h; head.appendChild(c); });
    tableEl.appendChild(head);
    people.sort(function (a, b) { return (a._key ? 0 : 1) - (b._key ? 0 : 1) || String(a.name).localeCompare(String(b.name)); });
    people.forEach(function (p) {
      var t = p._key && byKey[p._key], tr = document.createElement("tr");
      td(tr, p.name);
      var doing = p.role || (p.inMenu ? "In the menu" : (JOBS[p.job] || p.job || "Exploring"));
      if (!t && !p.inMenu && typeof p.x === "number") { var ns = map.nearestStation(p.x, p.z); if (ns && ns.d < 1500) doing += " at " + ns.s.name; }
      td(tr, doing === "Operator" ? "Train Operator" : doing);
      td(tr, t ? t.name : "");
      td(tr, t ? (t.dest || t.service) : "");
      td(tr, t ? t.nextName : "");
      td(tr, t ? (t.mph || 0) + " mph" : "");
      if (t) { tr.setAttribute("data-train", t._key); if (selected === t._key) tr.className = "sel"; tr.addEventListener("click", function () { selected = t._key; render(servers); }); }
      tableEl.appendChild(tr);
    });
    if (!people.length) { var tr = document.createElement("tr"), c = td(tr, "Nobody is playing right now."); c.colSpan = 6; tableEl.appendChild(tr); }
    cardEl.textContent = ""; cardEl.style.display = "none";
    var st = selected && byKey[selected];
    if (st) {
      cardEl.style.display = "";
      var h = document.createElement("h4"); h.textContent = st.name || st["class"]; cardEl.appendChild(h);
      var lines = [];
      if (st.dest || st.service) lines.push("Going to: " + (st.dest || st.service));
      if (st.nextName) lines.push("Next stop: " + st.nextName);
      lines.push("Speed: " + (st.mph || 0) + " mph");
      lines.push("On board: " + (st.people || []).map(function (p) { return p.name + " (" + (p.role === "Operator" ? "Train Operator" : p.role) + ")"; }).join(", "));
      lines.forEach(function (l) { var d = document.createElement("div"); d.textContent = l; cardEl.appendChild(d); });
    }
    return { trains: Object.keys(byKey).length, people: people.length };
  }
  function tick() {
    var url = demo ? map.base + "assets/live-demo.json" : cfg.feed;
    if (!url) { setStatus("", "The live feed is not connected yet, so no players are shown."); return; }
    fetch(url, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (j) {
      var now = Date.now() / 1000;
      var servers = (j.servers || [j]).filter(function (s) { return s && (demo || !s.time || now - s.time < 90); });
      var n = render(servers);
      setStatus("on", n.people + " player" + (n.people === 1 ? "" : "s") + " online, " + n.trains + " train" + (n.trains === 1 ? "" : "s") + " running, in " + servers.length + " server" + (servers.length === 1 ? "" : "s") + ". Updated " + new Date().toLocaleTimeString() + ".");
    }).catch(function () {
      setStatus("off", "The live feed is not answering at the moment. Trying again shortly.");
    });
  }
  RWUSchematic.create(wrap, { base: wrap.getAttribute("data-base") || "../" }).then(function (m) {
    map = m; layer = m.el("g", {}, m.svg);
    tick();
    if (demo || cfg.feed) setInterval(tick, Math.max(5, cfg.refreshSeconds || 10) * 1000);
  });
})();

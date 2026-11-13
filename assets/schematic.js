// Rail Works Universe line map viewer: the map picture with a layer on top for stations and trains.
// Drag to move, wheel or pinch to zoom. Used by the network map and the live map pages.
window.RWUSchematic = (function () {
  var NS = "http://www.w3.org/2000/svg";
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var a in attrs) e.setAttribute(a, attrs[a]);
    if (parent) parent.appendChild(e);
    return e;
  }
  // wrap: element with class rwu-sch; opts.base: path to the site root ("../")
  function create(wrap, opts) {
    var base = opts.base || "../";
    return fetch(base + "assets/schematic-data.json").then(function (r) { return r.json(); }).then(function (D) {
      var W = D.size[0], H = D.size[1];
      var stage = document.createElement("div"); stage.className = "rwu-sch-stage";
      var img = document.createElement("img");
      img.src = base + "assets/" + D.image; img.alt = "Rail Works Universe line map"; img.draggable = false;
      var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Stations on the line map" });
      stage.appendChild(img); stage.appendChild(svg); wrap.insertBefore(stage, wrap.firstChild);
      var view = { x: 0, y: 0, k: 1 }, moved = false;
      function clamp() {
        var r = wrap.getBoundingClientRect(), w = r.width * view.k, h = r.width * H / W * view.k;
        view.x = Math.min(r.width * 0.5, Math.max(r.width * 0.5 - w, view.x));
        view.y = Math.min(r.height * 0.5, Math.max(r.height * 0.5 - h, view.y));
      }
      function apply() { clamp(); stage.style.transform = "translate(" + view.x + "px," + view.y + "px) scale(" + view.k + ")"; }
      function zoomAt(cx, cy, f) {
        var k = Math.max(1, Math.min(8, view.k * f));
        view.x = cx - (cx - view.x) * (k / view.k); view.y = cy - (cy - view.y) * (k / view.k); view.k = k; apply();
      }
      function fit() { view = { x: 0, y: 0, k: 1 }; apply(); }
      wrap.addEventListener("wheel", function (e) {
        e.preventDefault(); var r = wrap.getBoundingClientRect();
        zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.2 : 1 / 1.2);
      }, { passive: false });
      var ptrs = {}, pinch = 0;
      wrap.addEventListener("pointerdown", function (e) { ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; moved = false; });
      wrap.addEventListener("pointermove", function (e) {
        var p = ptrs[e.pointerId]; if (!p) return;
        var ids = Object.keys(ptrs);
        if (ids.length === 1) {
          var dx = e.clientX - p.x, dy = e.clientY - p.y;
          if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
          if (!moved) { moved = true; wrap.classList.add("dragging"); try { wrap.setPointerCapture(e.pointerId); } catch (err) {} }
          view.x += dx; view.y += dy; apply();
        }
        ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
        if (ids.length === 2) {
          var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y), r = wrap.getBoundingClientRect();
          if (pinch) zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinch);
          pinch = d; moved = true;
        }
      });
      function up(e) { delete ptrs[e.pointerId]; pinch = 0; wrap.classList.remove("dragging"); }
      wrap.addEventListener("pointerup", up); wrap.addEventListener("pointercancel", up);
      // a click that ended a drag must not open a station
      wrap.addEventListener("click", function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
      var btns = wrap.querySelector(".rwu-sch-btns");
      if (btns) btns.addEventListener("click", function (e) {
        var a = e.target.getAttribute("data-act"), r = wrap.getBoundingClientRect();
        if (a === "in") zoomAt(r.width / 2, r.height / 2, 1.4);
        if (a === "out") zoomAt(r.width / 2, r.height / 2, 1 / 1.4);
        if (a === "fit") fit();
      });
      var byId = {};
      D.stations.forEach(function (s) { byId[s[0]] = { id: s[0], name: s[1], x: s[2], y: s[3], wx: s[4], wz: s[5], slug: s[6], platforms: s[7], tier: s[8] }; });
      // each link between neighbouring stations: its track in the game (wp) and its shape on the picture (sp)
      var edges = D.edges.map(function (e) {
        function poly(flat) {
          var p = [], len = [0];
          for (var i = 0; i < flat.length; i += 2) p.push([flat[i], flat[i + 1]]);
          for (var j = 1; j < p.length; j++) len.push(len[j - 1] + Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]));
          return { p: p, len: len, total: len[len.length - 1] || 1 };
        }
        return { a: e.a, b: e.b, studs: e.studs, w: poly(e.wp), s: poly(e.sp) };
      });
      function along(pl, f) {
        var d = f * pl.total;
        for (var i = 1; i < pl.p.length; i++) if (pl.len[i] >= d) {
          var t = (d - pl.len[i - 1]) / ((pl.len[i] - pl.len[i - 1]) || 1);
          return [pl.p[i - 1][0] + (pl.p[i][0] - pl.p[i - 1][0]) * t, pl.p[i - 1][1] + (pl.p[i][1] - pl.p[i - 1][1]) * t];
        }
        return pl.p[pl.p.length - 1];
      }
      // a position in the game (studs) -> the nearest piece of track -> the same place on the picture
      function locate(wx, wz) {
        var best = null;
        edges.forEach(function (e) {
          var P = e.w.p;
          for (var i = 0; i < P.length - 1; i++) {
            var ax = P[i][0], az = P[i][1], vx = P[i + 1][0] - ax, vz = P[i + 1][1] - az, L2 = vx * vx + vz * vz;
            var t = L2 ? Math.max(0, Math.min(1, ((wx - ax) * vx + (wz - az) * vz) / L2)) : 0;
            var d = Math.hypot(wx - ax - vx * t, wz - az - vz * t);
            if (!best || d < best.d) best = { d: d, e: e, f: (e.w.len[i] + t * Math.sqrt(L2)) / e.w.total };
          }
        });
        if (!best) return null;
        var p = along(best.e.s, best.f);
        return { x: p[0], y: p[1], off: best.d, a: best.e.a, b: best.e.b, f: best.f };
      }
      function nearestStation(wx, wz) {
        var best = null;
        for (var id in byId) { var s = byId[id], d = Math.hypot(wx - s.wx, wz - s.wz); if (!best || d < best.d) best = { d: d, s: s }; }
        return best;
      }
      var api = { data: D, svg: svg, stations: byId, edges: edges, locate: locate, nearestStation: nearestStation, el: el, fit: fit, base: base };
      api.addStationLinks = function (tip) {
        var g = el("g", { "class": "rwu-sch-stations" }, svg);
        D.stations.forEach(function (s) {
          var a = el("a", { href: base + "stations/" + s[6] + "/", "aria-label": s[1] }, g);
          var c = el("circle", { cx: s[2], cy: s[3], r: 30, id: "stn-" + s[0] }, a);
          var t = document.createElementNS(NS, "title"); t.textContent = s[1]; c.appendChild(t);
          if (tip) {
            a.addEventListener("mouseenter", function () { tip.textContent = s[1] + ": " + s[7] + " platform" + (s[7] === 1 ? "" : "s") + ". Click to open its page."; });
            a.addEventListener("mouseleave", function () { tip.textContent = tip.getAttribute("data-idle") || ""; });
          }
        });
        if (location.hash.length > 1) { var h = document.getElementById("stn-" + location.hash.slice(1)); if (h) h.classList.add("hit"); }
      };
      apply();
      window.addEventListener("resize", apply);
      return api;
    });
  }
  return { create: create };
})();

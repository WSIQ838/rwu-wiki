#!/usr/bin/env python3
"""Builds the wiki's data pages from data/export.json (an export of the game's own data).
Run:  python3 build_pages.py   then   mkdocs build
Hand-written pages (guides, about) are not touched."""
import json, os, re, collections, shutil
ROOT = os.path.dirname(os.path.abspath(__file__))
E = json.load(open(os.path.join(ROOT, 'data', 'export.json')))
DOCS = os.path.join(ROOT, 'docs')
MILE = 1609.344 / 0.28
COMP = {'MLR': ('MetroLink', 'metrolink', '#1d9be0'), 'CR': ('Express', 'express', '#ff0a84'),
        'JR': ('JetRail', 'jetrail', '#f28a14'), 'CL': ('Coastline', 'coastline', '#20c7c0')}
OPERATOR_CODE = {'MetroLink': 'MLR', 'Express': 'CR', 'JetRail': 'JR', 'Coastline': 'CL'}
def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
def miles(studs): return studs / MILE
def w(path, text):
    p = os.path.join(DOCS, path); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write(text.rstrip() + '\n')
for d in ('stations', 'lines', 'companies', 'trains', 'jobs'):
    shutil.rmtree(os.path.join(DOCS, d), ignore_errors=True)

stations = {s['id']: s for s in E['stations']}
lines = {l['id']: l for l in E['lines']}
routes_by_line = collections.defaultdict(list)
for r in E['routes']: routes_by_line[r['line']].append(r)
plat = {p['id']: (s, p) for s in E['stations'] for p in s['platforms']}
lines_at = collections.defaultdict(list)
for l in E['lines']:
    for st in l['stops']:
        if l['id'] not in lines_at[st]: lines_at[st].append(l['id'])
def st_link(sid, up=1): return f"[{stations[sid]['name']}]({'../' * up}stations/{slug(stations[sid]['name'])}.md)"
def line_link(lid, up=1): return f"[{lines[lid]['name']}]({'../' * up}lines/{slug(lid)}.md)"
def comp_link(code, up=1): return f"[{COMP[code][0]}]({'../' * up}companies/{COMP[code][1]}.md)"
def line_miles(lid):
    rs = routes_by_line[lid]
    return miles(max(r['studs'] for r in rs)) if rs else 0
TIER = {'Terminal': 'Terminus', 'Town': 'Town station', 'Local': 'Local station', 'Suburban': 'Suburban station', 'Junction': 'Junction', 'Airport': 'Airport station'}

# the links between neighbouring stations (data/schematic.json), to tell which stations a route runs through
import heapq
_SCH = json.load(open(os.path.join(ROOT, 'data', 'schematic.json')))
_ADJ = collections.defaultdict(list)
for e_ in _SCH['edges']:
    _ADJ[e_['a']].append((e_['b'], e_['studs'])); _ADJ[e_['b']].append((e_['a'], e_['studs']))
def between(a, b):
    """Stations on the shortest way from a to b, not counting a and b."""
    if a == b: return []
    dist, prev, pq = {a: 0}, {}, [(0, a)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == b: break
        if d > dist.get(u, 1e18): continue
        for v, w_ in _ADJ[u]:
            if d + w_ < dist.get(v, 1e18): dist[v] = d + w_; prev[v] = u; heapq.heappush(pq, (d + w_, v))
    out, u = [], prev.get(b)
    while u and u != a: out.append(u); u = prev.get(u)
    return out[::-1]

# ---------------------------------------------------------------- stations
rows = []
for s in sorted(E['stations'], key=lambda s: s['name']):
    comps = sorted({lines[l]['company'] for l in lines_at[s['id']]}, key=lambda c: COMP[c][0])
    rows.append(f"| [{s['name']}]({slug(s['name'])}.md) | {s['id']} | {TIER.get(s['tier'], s['tier'])} | {len(s['platforms'])} | {', '.join(COMP[c][0] for c in comps) or 'none'} | {len(lines_at[s['id']])} |")
    e, n = s['x'] / MILE, -s['z'] / MILE
    t = [f"# {s['name']}", '',
         f"**{s['name']}** ({s['id']}) is a {TIER.get(s['tier'], s['tier']).lower()} on the Rail Works Universe network with {len(s['platforms'])} platform{'s' if len(s['platforms']) != 1 else ''}.", '',
         '| | |', '|---|---|', f"| Station code | {s['id']} |", f"| Type | {TIER.get(s['tier'], s['tier'])} |", f"| Platforms | {len(s['platforms'])} |",
         f"| Position | {abs(e):.1f} mi {'east' if e >= 0 else 'west'}, {abs(n):.1f} mi {'north' if n >= 0 else 'south'} of Union Station |" if s['id'] != 'UNS' else '| Position | Centre of the network |',
         f"| Companies | {', '.join(comp_link(c) for c in comps) or 'none'} |", '', '## Platforms', '',
         '| Platform | Length | Routes that call here |', '|---|---|---|']
    use = collections.defaultdict(list)
    for r in E['routes']:
        for pid in r['stops']:
            if pid in plat and plat[pid][0]['id'] == s['id'] and r['line'] not in use[pid]: use[pid].append(r['line'])
    for p in s['platforms']:
        t.append(f"| {p['n']} | {p['len']} studs ({p['len'] * 0.28:.0f} m) | {', '.join(line_link(l) for l in use[p['id']]) or 'No route calls here'} |")
    t += ['', '## Services', '']
    if lines_at[s['id']]:
        t += ['| Route | Company | Previous stop | Next stop |', '|---|---|---|---|']
        for lid in sorted(lines_at[s['id']], key=lambda l: (COMP[lines[l]['company']][0], lines[l]['name'])):
            stops = lines[lid]['stops']; i = stops.index(s['id'])
            prev = st_link(stops[i - 1]) if i > 0 else 'Starts here'
            nxt = st_link(stops[i + 1]) if i < len(stops) - 1 else 'Ends here'
            t.append(f"| {line_link(lid)} | {comp_link(lines[lid]['company'])} | {prev} | {nxt} |")
    else: t.append('No passenger route calls at this station at the moment.')
    t += ['', f"See it on the [network map](../map.md#{s['id']})."]
    w(f"stations/{slug(s['name'])}.md", '\n'.join(t))
w('stations/index.md', '\n'.join(['# Stations', '', f"The network has {len(E['stations'])} stations. Lengths on the station pages are in studs (1 stud = 0.28 m).", '',
   '| Station | Code | Type | Platforms | Companies | Routes |', '|---|---|---|---|---|---|'] + rows))

# ---------------------------------------------------------------- lines
rows = []
for l in sorted(E['lines'], key=lambda l: (COMP[l['company']][0], l['name'])):
    rs = routes_by_line[l['id']]
    mi = line_miles(l['id'])
    rows.append(f"| [{l['name']}]({slug(l['id'])}.md) | {comp_link(l['company'])} | {st_link(l['stops'][0])} | {st_link(l['stops'][-1])} | {len(l['stops'])} | {mi:.1f} mi |")
    loop = l['stops'][0] == l['stops'][-1]
    kind = 'Limited stop' if l.get('limited') else {'Local': 'All stations', 'Regional': 'Regional', 'Express': 'Express'}.get(l['kind'], l['kind'])
    calls = len(l['stops']) - (1 if loop else 0)
    where = (f"a circular route from {st_link(l['stops'][0])} and back" if loop else f"from {st_link(l['stops'][0])} to {st_link(l['stops'][-1])}")
    t = [f"# {l['name']}", '', f"**{l['name']}** is {'an' if COMP[l['company']][0][0] in 'AEIOU' else 'a'} {comp_link(l['company'])} route {where}: {len(l['stops'])} stops over {mi:.1f} miles.", '',
         '| | |', '|---|---|', f"| Route code | {l['id']} |", f"| Company | {comp_link(l['company'])} |", f"| Type | {kind} |", f"| Length | {mi:.1f} mi ({mi * 1.609344:.1f} km) |", f"| Stops | {len(l['stops'])} |", '',
         'In the Drive menu, Regular runs the stops listed here. Rapid and Express skip more of them.', '']
    for r in rs:
        t += [f"## {r['name']}", '', '| # | Station | Platform |', '|---|---|---|']
        passed = []
        for i, pid in enumerate(r['stops'], 1):
            s, p = plat[pid]
            note = ' (driver changes ends)' if i in r['reverse'] else ''
            t.append(f"| {i} | {st_link(s['id'])}{note} | {p['n']} |")
            if i < len(r['stops']):
                for x in between(s['id'], plat[r['stops'][i]][0]['id']):
                    if x not in passed: passed.append(x)
        called = {plat[pid][0]['id'] for pid in r['stops']}
        passed = [x for x in passed if x not in called]
        t += ['', f"Distance: {miles(r['studs']):.1f} miles." + (f" Runs through without stopping: {', '.join(st_link(x) for x in passed)}." if passed else ''), '']
    t.append(f"See it on the [network map](../map.md).")
    w(f"lines/{slug(l['id'])}.md", '\n'.join(t))
w('lines/index.md', '\n'.join(['# Routes', '', f"There are {len(E['lines'])} routes, each driven in both directions. All routes are open to every player in the Drive menu.", '',
   '| Route | Company | From | To | Stops | Length |', '|---|---|---|---|---|---|'] + rows))

# ---------------------------------------------------------------- trains
by_class = collections.defaultdict(list)
for t_ in E['trains']: by_class[t_['class']].append(t_)
rows = []
for cls in sorted(by_class):
    ts = by_class[cls]
    sizes = sorted({(x['cars'], x['label'], x['studs'], x['seats']) for x in ts})
    ops = sorted({x['operator'] for x in ts})
    x0 = ts[0]
    rank = max(x['rank'] for x in ts)
    rows.append(f"| [{cls}]({slug(cls)}.md) | {x0['power']} | {x0['mph']} mph | {', '.join(str(s[0]) for s in sizes)} | {', '.join(ops)} |")
    t = [f"# {cls}", '', f"The **{cls}** is a {x0['power'].lower()} train with a top speed of {x0['mph']} mph. It runs for {', '.join(ops[:-1]) + ' and ' + ops[-1] if len(ops) > 1 else ops[0]}.", '',
         '## Sizes', '', '| Formation | Cars | Length | Seats | Weight | Power |', '|---|---|---|---|---|---|']
    seen = set()
    for x in sorted(ts, key=lambda x: x['cars']):
        if x['cars'] in seen: continue
        seen.add(x['cars'])
        t.append(f"| {x['label']} | {x['cars']} | {x['studs']} studs ({x['studs'] * 0.28:.0f} m) | {x['seats']} | {x['tonnes']:.0f} t | {x['kw']:.0f} kW |")
    t += ['', '## Liveries', '', '| Company | Liveries |', '|---|---|']
    for op in ops:
        t.append(f"| {comp_link(OPERATOR_CODE[op])} | {', '.join(sorted({x['livery'] for x in ts if x['operator'] == op}))} |")
    t += ['', '## Who can drive it', '']
    t.append('Any Train Operator can drive it.' if rank <= 1 else 'It needs the Qualified Operator rank (300 Operator XP).')
    t += ['', 'A train that is longer than a platform stops with its front at the far end of the platform and opens only the doors of the cars that are alongside.']
    w(f"trains/{slug(cls)}.md", '\n'.join(t))
w('trains/index.md', '\n'.join(['# Trains', '', f"There are {len(by_class)} classes of train, in {len(E['trains'])} combinations of company, livery and length. All of them are unlocked for every player; the HST also needs the Qualified Operator rank.", '',
   '| Class | Power | Top speed | Cars | Companies |', '|---|---|---|---|---|'] + rows))

# ---------------------------------------------------------------- companies
rows = []
for code, (name, sl, col) in sorted(COMP.items(), key=lambda kv: kv[1][0]):
    ls = sorted([l for l in E['lines'] if l['company'] == code], key=lambda l: l['name'])
    ts = [x for x in E['trains'] if x['operator'] == name]
    sts = sorted({st for l in ls for st in l['stops']}, key=lambda s: stations[s]['name'])
    rows.append(f"| [{name}]({sl}.md) | {len(ls)} | {len(sts)} | {len({x['class'] for x in ts})} |")
    t = [f"# {name}", '', f"**{name}** is one of the four train companies of Rail Works Universe. It runs {len(ls)} routes serving {len(sts)} stations.", '',
         '## Routes', '', '| Route | From | To | Stops | Length |', '|---|---|---|---|---|']
    for l in ls: t.append(f"| {line_link(l['id'])} | {st_link(l['stops'][0])} | {st_link(l['stops'][-1])} | {len(l['stops'])} | {line_miles(l['id']):.1f} mi |")
    t += ['', '## Trains', '', '| Class | Liveries | Sizes (cars) |', '|---|---|---|']
    for cls in sorted({x['class'] for x in ts}):
        cs = [x for x in ts if x['class'] == cls]
        t.append(f"| [{cls}](../trains/{slug(cls)}.md) | {', '.join(sorted({x['livery'] for x in cs}))} | {', '.join(str(n) for n in sorted({x['cars'] for x in cs}))} |")
    t += ['', '## Stations served', '', ', '.join(st_link(s) for s in sts)]
    w(f"companies/{sl}.md", '\n'.join(t))
w('companies/index.md', '\n'.join(['# Companies', '', 'Four companies run the passenger trains.', '', '| Company | Routes | Stations | Train classes |', '|---|---|---|---|'] + rows))

# ---------------------------------------------------------------- jobs
JOBN = {'Operator': 'Train Operator', 'Conductor': 'Conductor', 'Signaler': 'Signaler', 'Dispatcher': 'Dispatcher', 'StationStaff': 'Station Staff', 'Maintenance': 'Maintenance'}
rows = []
for j in sorted(E['jobs'], key=lambda j: list(JOBN).index(j['id']) if j['id'] in JOBN else 99):
    nm = JOBN.get(j['id'], j['id'])
    rows.append(f"| [{nm}]({slug(nm)}.md) | {j.get('description') or ''} |")
    t = [f"# {nm}", '', j.get('description') or '', '', '## Ranks', '', '| Rank | Short | Job XP needed |', '|---|---|---|']
    for r in j['ranks']:
        t.append(f"| {r['name']} | {r.get('short') or ''} | {r['xp'] if r['xp'] >= 0 else 'Awarded by staff'} |")
    w(f"jobs/{slug(nm)}.md", '\n'.join(t))
w('jobs/index.md', '\n'.join(['# Jobs', '', f"There are {len(E['jobs'])} jobs. Each has its own XP and five ranks; the top two ranks are awarded by staff.", '', '| Job | What you do |', '|---|---|'] + rows))


# ---------------------------------------------------------------- schematic map data (network map, live map)
# data/schematic.json holds where each station sits on the line map picture, the bends between stations, and
# for each pair of neighbouring stations the real track between them ("edges": length in studs and points in
# the game). With that, a train's position in the game can be placed on the picture.
SC = json.load(open(os.path.join(ROOT, 'data', 'schematic.json')))
edges = {(e['a'], e['b']): dict(e) for e in SC['edges']}
for (a, b), e in edges.items():
    via = SC['via'].get(f'{a}-{b}')
    if via is None and f'{b}-{a}' in SC['via']: via = SC['via'][f'{b}-{a}'][::-1]
    e['sp'] = [v_ for p in [SC['stations'][a]] + (via or []) + [SC['stations'][b]] for v_ in p]
SD = {'image': SC['image'], 'size': SC['size'],
      'stations': [[s['id'], s['name'], SC['stations'][s['id']][0], SC['stations'][s['id']][1], s['x'], s['z'], slug(s['name']), len(s['platforms']), s['tier']] for s in E['stations']],
      'edges': list(edges.values()),
      'lines': [{'id': l['id'], 'name': l['name'], 'company': l['company'], 'stops': l['stops']} for l in E['lines']],
      'companies': {c: {'name': v[0], 'color': v[2]} for c, v in COMP.items()}}
json.dump(SD, open(os.path.join(DOCS, 'assets', 'schematic-data.json'), 'w'), separators=(',', ':'))
print('schematic:', len(SD['stations']), 'stations,', len(SD['edges']), 'links')

# ---------------------------------------------------------------- map data + home stats
os.makedirs(os.path.join(DOCS, 'assets'), exist_ok=True)
stats = {'stations': len(E['stations']), 'routes': len(E['lines']), 'trains': len(E['trains']), 'classes': len(by_class), 'track_miles': round(miles(E['meta']['trackStuds'])),
         'signals': E['meta']['signals'], 'switches': E['meta']['switches'], 'platforms': sum(len(s['platforms']) for s in E['stations']), 'exported': E['meta']['exported']}
json.dump(stats, open(os.path.join(ROOT, 'data', 'stats.json'), 'w'))
print(stats)

# ---------------------------------------------------------------- site menu: the Routes section follows the data
yml_path = os.path.join(ROOT, 'mkdocs.yml')
yml = open(yml_path).read()
block = '- Routes:\n  - lines/index.md\n' + ''.join(f"  - {json.dumps(l['name'])}: lines/{slug(l['id'])}.md\n" for l in E['lines'])
yml2, n_ = re.subn(r'- Routes:\n(?:  .*\n)+', lambda m: block, yml, count=1)
if n_ and yml2 != yml: open(yml_path, 'w').write(yml2)

# ---------------------------------------------------------------- home page numbers follow the data
ip = os.path.join(DOCS, 'index.md')
ix = open(ip).read()
ix2 = re.sub(r'\| Routes \| \[\d+\]', f"| Routes | [{len(E['lines'])}]", ix)
ix2 = re.sub(r'All \d+ routes', f"All {len(E['lines'])} routes", ix2)
if ix2 != ix: open(ip, 'w').write(ix2)

# Rail Works Universe Wiki

The wiki for Rail Works Universe (RWU), a railway game on Roblox: stations, routes, trains, companies, jobs, a clickable network map and a live map of who is playing.

- `docs/` - the pages. `docs/guides/` and `docs/about.md` are written by hand.
- `data/export.json` - an export of the game's own data. `build_pages.py` turns it into the station, route, train, company and job pages and the map data.
- `data/schematic.json` - where each station sits on the line map picture (used by the network map and the live map).
- `LIVE-FEED.md` - how the live map gets its data from the game.
- `mkdocs.yml` - site settings (MkDocs with the Material theme).

## Build it locally

```
pip install mkdocs-material
python3 build_pages.py
mkdocs serve
```

## Publishing

Every push to `main` rebuilds the site and publishes it to the `gh-pages` branch (see `.github/workflows/pages.yml`). In the repository settings, under Pages, set the source to the `gh-pages` branch.

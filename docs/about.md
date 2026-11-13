# About this wiki

This is the wiki for Rail Works Universe (RWU), a railway game on Roblox.

## Where the pages come from

- The **station, route, train, company and job pages** are generated from an export of the game's own data (`data/export.json`). Do not edit them by hand: they are rewritten whenever the export is refreshed. To rebuild them run `python3 build_pages.py`.
- The **guides** and this page are written by hand, in `docs/guides/` and `docs/about.md`.
- The **network map** and the **live map** use the line map picture with `docs/assets/schematic-data.json`, which the same script writes from `data/schematic.json`.

## Editing

Every page has an edit button at the top right that opens it on GitHub. Guides are the best place to help: write only what you have checked in the game.

## Building the site

The site is built with MkDocs and the Material theme:

```
pip install mkdocs-material
python3 build_pages.py
mkdocs serve
```

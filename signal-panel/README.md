# RWU signal panel

A small Cloudflare Worker that does two jobs for Rail Works Universe:

- **Second screen for signallers.** It shows a signal box's track diagram in a web browser. The game sends each staffed box's state about once a second; the page at `/panel` draws it. It only shows: the levers stay in the game.
- **Live map feed for the wiki.** It keeps the game's "who is on which train" updates and offers them at `/livemap` (see `LIVE-FEED.md` in the repo root).

It runs on Cloudflare, so nothing has to be installed or kept running on the server box.

## Set it up (once)

You need the Cloudflare account that has `repeaternation.com` in it.

1. **Connect this repo.** In the Cloudflare dashboard open **Workers & Pages**, create a new Worker, and choose to import a Git repository. Pick `WSIQ838/rwu-wiki`.
   - Root directory: `signal-panel`
   - Deploy command: `npx wrangler deploy`
   - Leave the build command empty.
2. **Add the key.** Open the new Worker's settings, find **Variables and Secrets**, and add a **secret** named `RWU_API_KEY`. Its value must be exactly the key the game uses (its `discord_bot_key` secret).
3. **Deploy.** Run the deployment (or push any change to this folder). `wrangler.toml` already lists the addresses on `rb.repeaternation.com` the Worker answers; everything else on that name still goes to the Discord bot as before.
4. **Check it.** Open `https://rb.repeaternation.com/panel`. You should see a box asking for a desk code.
5. **In the game** the `discord_bot_key` secret must be set (Creator Hub > the experience > Secrets). Nothing else changes in the game: it already sends to these addresses.

For the wiki's live map, set `feed` in `docs/assets/live-config.js` to `https://rb.repeaternation.com/livemap`.

## How a signaller uses it

1. Sit at a signal box desk in the game and press **2nd screen** on the top bar.
2. Open the address it shows in a browser on the other screen and type the six-letter code.

The code belongs to that desk while that signaller sits there. Anyone who has the code can watch that desk, so treat it like a private link.

## Addresses

| Address | Who uses it |
|---|---|
| `POST /server/signalbox` | The game (needs the key). Answers which desks' drawing plans it is missing. |
| `GET /signalbox/CODE` | The page: one desk's plan and state. |
| `GET /ws/CODE` | The page: the same, pushed over a WebSocket whenever the game sends. |
| `GET /panel` | The page itself (`public/panel.html`). |
| `POST /server/livemap` | The game (needs the key). |
| `GET /livemap` | The wiki's live map. |

## Limits of the free plan

Cloudflare's free plan allows 100,000 Worker requests a day. The game's updates count (about 3,600 an hour while any box is staffed, plus 360 an hour for the live map). A signaller's page listens on one open connection, so watching costs almost nothing. If the limit is ever reached the page stops updating until midnight UTC.

Everything is held in memory only. If Cloudflare restarts the Worker, the game is told which plans are missing and sends them again within a second or two.

## Try it on your own computer

```
npm install
echo RWU_API_KEY=testkey > .dev.vars
npx wrangler dev
curl -X POST -H "x-api-key: testkey" --data-binary @sample-clayton.json http://localhost:8787/server/signalbox
```

Then open `http://localhost:8787/panel#9BVLZZ`. `sample-clayton.json` is one real update from the game (Clayton, with a train in platform 1 and a route set). A desk is forgotten 30 seconds after its last update.

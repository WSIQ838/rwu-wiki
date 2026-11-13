# Live map feed

The live map page (`docs/live.md`) shows who is playing and which train they are on. The data travels like this:

1. **The game** (`ServerScriptService.Server.Services.LiveMapService`) sends an update every 10 seconds while players are online:
   `POST <status server>/server/livemap` with the header `x-api-key` (the same key the server heartbeat uses) and a JSON body.
2. **The status server** keeps the latest update from each game server and offers them to browsers.
3. **The wiki** reads `GET <status server>/livemap` every 10 seconds. Put that address in `docs/assets/live-config.js` (`feed`).

## What the status server needs

Two small additions next to the existing `/server/heartbeat` handler:

- `POST /server/livemap`: check `x-api-key` exactly as the heartbeat does, then remember the body under its `serverId` with the time it arrived.
- `GET /livemap`: no key. Answer `{ "servers": [ ...bodies received in the last 60 seconds... ] }` with the header
  `Access-Control-Allow-Origin: *` (or the wiki's address) so a browser may read it.

Example for a Node server using Express (adapt to whatever the server is written in):

```js
const live = new Map(); // serverId -> { at, body }

app.post("/server/livemap", express.json({ limit: "200kb" }), (req, res) => {
  if (req.get("x-api-key") !== process.env.API_KEY) return res.sendStatus(401); // same check as the heartbeat
  const body = req.body;
  if (!body || typeof body.serverId !== "string") return res.sendStatus(400);
  live.set(body.serverId, { at: Date.now(), body });
  res.sendStatus(204);
});

app.get("/livemap", (req, res) => {
  const cutoff = Date.now() - 60_000;
  for (const [id, v] of live) if (v.at < cutoff) live.delete(id);
  res.set("Access-Control-Allow-Origin", "*").set("Cache-Control", "no-store");
  // the server id is not needed by the map, so it is left out of what the public can read
  res.json({ servers: [...live.values()].map(({ body }) => ({ ...body, serverId: undefined })) });
});
```

## The update the game sends

```json
{
  "v": 1, "serverId": "…", "placeId": 0, "time": 1794598311, "players": 1, "maxPlayers": 60,
  "trains": [
    { "id": "T001", "class": "ML155_BlueTeal_2", "name": "MetroLink Class 155 (Blue and Teal), 2 cars", "cars": 2,
      "x": 1361, "z": 2927, "mph": 0, "dest": "Thornbury", "next": "FNH", "nextName": "Fernhill",
      "people": [ { "name": "DisplayName", "role": "Driver" } ] }
  ],
  "people": [ { "name": "DisplayName", "job": "Operator", "role": "Driver", "train": "T001", "inMenu": false, "x": 1471, "z": 2976 } ]
}
```

`x` and `z` are positions in the game in studs; the wiki turns them into a place on the line map. Only trains with a player on board are sent.
Names are Roblox display names. To stop sending, set a `LiveMap` attribute on `ServerStorage.DiscordBot` to `false` in the game.

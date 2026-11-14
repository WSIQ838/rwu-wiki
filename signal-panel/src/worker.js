// RWU signal panel (Cloudflare Worker)
// Shows a signal box's track diagram in a web browser, for a signaller's second screen, and
// carries the wiki's live map feed. The Roblox game sends updates here; browsers read them.
// Nothing in the game can be changed from here.
//
//   POST /server/signalbox   from the game, header x-api-key (SignalerService:_PanelFeed).
//                            Answers { ok, need: [codes] }: desks whose drawing plan is not held.
//   GET  /signalbox/CODE     one desk: { ok, id, name, by, rev, plan?, state, age } (?rev=N leaves
//                            the plan out when the page already has plan N)
//   GET  /ws/CODE            the same, pushed over a WebSocket each time the game sends
//   GET  /panel              the page (public/panel.html)
//   POST /server/livemap     from the game, header x-api-key (LiveMapService)
//   GET  /livemap            { servers: [...] } for the wiki's live map (see LIVE-FEED.md)
//   GET  /healthz            "ok"
//
// The key is the secret RWU_API_KEY: the same value as the game's "discord_bot_key" secret.
import { DurableObject } from 'cloudflare:workers';

const MAX_BODY = 2 * 1024 * 1024; // the largest update taken from the game, in bytes
const DESK_STALE_MS = 30_000; // a desk not heard from for this long is forgotten
const LIVE_STALE_MS = 60_000; // and a game server's live map update
const CODE = /^[A-Z0-9]{4,12}$/;
const OPEN = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...OPEN } });

async function keyOk(given, env) {
  if (!env.RWU_API_KEY || typeof given !== 'string') return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(env.RWU_API_KEY))]);
  return crypto.subtle.timingSafeEqual(a, b);
}

// what a browser is given for one desk
const view = (d, withPlan) => {
  const out = { ok: true, id: d.id, name: d.name, by: d.by, rev: d.rev, state: d.state, age: Date.now() - d.at };
  if (withPlan) out.plan = d.plan;
  return out;
};

// Everything is kept in memory in this one object. If Cloudflare puts it to sleep the memory is
// lost, and that is fine: the game is told which plans are missing and sends them again.
export class PanelHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.desks = new Map(); // code -> { id, name, by, rev, plan, state, at }
    this.live = new Map(); // game server id -> { at, body }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const code = (url.searchParams.get('code') || '').toUpperCase();
    if (url.pathname === '/update') {
      let update;
      try {
        update = await request.json();
      } catch {
        return json(400, { ok: false, error: 'bad json' });
      }
      return json(200, { ok: true, need: this.take(update) });
    }
    if (url.pathname === '/desk') {
      const d = this.fresh(code);
      if (!d) return json(404, { ok: false, error: 'no such desk' });
      return json(200, view(d, Number(url.searchParams.get('rev')) !== d.rev));
    }
    if (url.pathname === '/ws') {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], [code]);
      const d = this.fresh(code);
      pair[1].serializeAttachment({ rev: d ? d.rev : -1 });
      pair[1].send(JSON.stringify(d ? view(d, true) : { ok: false, error: 'no such desk' }));
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname === '/live-update') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { ok: false, error: 'bad json' });
      }
      if (!body || typeof body.serverId !== 'string') return json(400, { ok: false, error: 'no serverId' });
      this.live.set(body.serverId, { at: Date.now(), body });
      return json(200, { ok: true });
    }
    if (url.pathname === '/live') {
      const cut = Date.now() - LIVE_STALE_MS;
      for (const [id, v] of this.live) if (v.at < cut) this.live.delete(id);
      // (the game server's id is not needed by the map, so the public is not given it)
      return json(200, { servers: [...this.live.values()].map(({ body }) => ({ ...body, serverId: undefined })) });
    }
    return json(404, { ok: false, error: 'not found' });
  }

  fresh(code) {
    const d = this.desks.get(code);
    if (d && Date.now() - d.at > DESK_STALE_MS) {
      this.desks.delete(code);
      return null;
    }
    return d && d.plan ? d : null;
  }

  take(update) {
    const need = [];
    const now = Date.now();
    for (const [code, d] of this.desks) if (now - d.at > DESK_STALE_MS) this.desks.delete(code);
    for (const box of Array.isArray(update?.boxes) ? update.boxes : []) {
      const code = typeof box?.code === 'string' ? box.code.toUpperCase() : '';
      if (!CODE.test(code)) continue;
      const old = this.desks.get(code);
      // the plan comes only when it is new; otherwise the one already held is kept (if it is the same one)
      const plan = box.plan ?? (old && old.rev === box.rev && old.id === box.id ? old.plan : null);
      const d = { id: String(box.id ?? ''), name: String(box.name ?? ''), by: String(box.by ?? ''), rev: Number(box.rev) || 0, plan, state: box.state ?? {}, at: now };
      this.desks.set(code, d);
      if (!plan) {
        need.push(code);
        continue;
      }
      // push it to every browser watching this desk (with the plan if that browser has not got this one)
      for (const ws of this.ctx.getWebSockets(code)) {
        try {
          const has = ws.deserializeAttachment()?.rev === d.rev;
          ws.send(JSON.stringify(view(d, !has)));
          if (!has) ws.serializeAttachment({ rev: d.rev });
        } catch {
          // (a browser that has gone away)
        }
      }
    }
    return need;
  }

  webSocketMessage() {
    // (the page only listens)
  }

  webSocketClose(ws, code) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code);
    } catch {
      // already closed
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const hub = env.HUB.get(env.HUB.idFromName('hub'));
    const toHub = (to, init) => hub.fetch(new Request('https://hub' + to, init));

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...OPEN, 'Access-Control-Allow-Headers': 'content-type' } });
    }
    if (request.method === 'POST' && (path === '/server/signalbox' || path === '/server/livemap')) {
      if (!(await keyOk(request.headers.get('x-api-key'), env))) return json(401, { ok: false, error: 'bad key' });
      const text = await request.text();
      if (text.length > MAX_BODY) return json(413, { ok: false, error: 'too large' });
      return toHub(path === '/server/signalbox' ? '/update' : '/live-update', { method: 'POST', body: text });
    }
    if (request.method === 'GET' && path.startsWith('/signalbox/')) {
      const code = decodeURIComponent(path.slice('/signalbox/'.length)).toUpperCase();
      if (!CODE.test(code)) return json(404, { ok: false, error: 'no such desk' });
      return toHub(`/desk?code=${code}&rev=${encodeURIComponent(url.searchParams.get('rev') ?? '')}`);
    }
    if (request.method === 'GET' && path.startsWith('/ws/')) {
      const code = decodeURIComponent(path.slice('/ws/'.length)).toUpperCase();
      if (!CODE.test(code) || request.headers.get('Upgrade') !== 'websocket') return json(400, { ok: false, error: 'not a websocket request' });
      return hub.fetch(new Request(`https://hub/ws?code=${code}`, request));
    }
    if (request.method === 'GET' && path === '/livemap') return toHub('/live');
    if (request.method === 'GET' && path === '/healthz') return new Response('ok', { headers: OPEN });
    if (request.method === 'GET' && path === '/') return Response.redirect(new URL('/panel', url).toString(), 302);
    return json(404, { ok: false, error: 'not found' });
  },
};

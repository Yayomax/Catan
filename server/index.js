// Servidor de Litoral: sirve el cliente compilado y maneja las salas por WebSocket.
// El servidor es la autoridad: los clientes solo mandan intenciones.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createGame, applyAction, viewFor, timeoutStage, timerStage, timerKey, newFlows } from '../shared/game.js';
import { createStore } from './accounts.js';

const PORT = Number(process.env.PORT) || 3001;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
// Cuentas y amigos: en Docker, DATA_DIR apunta a un volumen que sobrevive a los deploys.
const store = createStore(process.env.DATA_DIR || path.join(ROOT, 'data'));
const COLORS = ['#c8402f', '#2f6fb5', '#e3a21a', '#ece6d6', '#3c9a5f', '#8456b0'];
const MAX_PLAYERS = 6;
const TURN_OPTIONS = [0, 30, 60, 90, 120, 180]; // segundos; 0 = sin límite
const BONUS_MS = 10000;
const ROLL_MS = 5000; // para tirar los dados
const DISCARD_MS = 15000; // para descartar con un 7
const CHAT_MAX = 60;
const OFFLINE_MS = 30000; // turno de alguien desconectado
const LOBBY_GRACE_MS = 45000; // lugar guardado en la sala de espera
const BONUS_ACTIONS = new Set(['buildRoad', 'buildSettlement', 'buildCity', 'buyCard', 'playCard', 'bankTrade', 'offerTrade', 'acceptTrade']);
// Solo para pruebas automáticas: permite turnos cortos.
if (process.env.LITORAL_TEST_TIMERS) TURN_OPTIONS.push(4, 15);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  let url;
  try {
    url = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  let file = path.normalize(path.join(DIST, url));
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  const exists = fs.existsSync(file) && !fs.statSync(file).isDirectory();
  // Un archivo que no existe (por ejemplo, de otra versión durante un deploy)
  // es un 404: nunca la página, que un CDN podría guardar como si fuera el JS.
  if (!exists && (url.startsWith('/assets/') || path.extname(url))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('No encontrado');
    return;
  }
  if (!exists) file = path.join(DIST, 'index.html');
  fs.readFile(file, (e, data) => {
    if (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('Falta compilar el cliente: npm run build');
      return;
    }
    const hashed = file.includes(`${path.sep}assets${path.sep}`);
    if (path.basename(file) === 'index.html') {
      // Las previews de WhatsApp e Instagram necesitan la dirección completa de la imagen.
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
      const local = /^(localhost|127\.|\[::1\])/.test(host);
      const proto = String(req.headers['x-forwarded-proto'] || (local ? 'http' : 'https')).split(',')[0].trim();
      data = Buffer.from(data.toString('utf8').replaceAll('__ORIGIN__', `${proto}://${host}`));
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      // Los archivos con hash en el nombre no cambian nunca; la página siempre se revalida.
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(data);
  });
});

const rooms = new Map();

// ---------- Cuentas, presencia y amigos ----------

const sockets = new Map(); // usuario -> Set de conexiones
const invites = new Map(); // usuario -> [{ from, code, at }]
const INVITE_MS = 15 * 60 * 1000;
const loginFails = new Map(); // usuario -> { n, until }

function setUser(ws, name) {
  if (ws.user) sockets.get(ws.user)?.delete(ws);
  ws.user = name || null;
  if (name) {
    if (!sockets.has(name)) sockets.set(name, new Set());
    sockets.get(name).add(ws);
  }
}

function statusOf(name) {
  const set = sockets.get(name);
  if (!set || !set.size) return { status: 'offline' };
  let best = { status: 'online' };
  for (const ws of set) {
    const room = ws.room;
    if (!room || !room.players.some((p) => p.ws === ws)) continue;
    if (room.game && room.game.phase !== 'ended') return { status: 'playing', code: room.code };
    best = { status: 'lobby', code: room.code, joinable: !room.game && room.players.length < MAX_PLAYERS };
  }
  return best;
}

function liveInvites(name) {
  const list = (invites.get(name) || []).filter((i) => {
    const room = rooms.get(i.code);
    return Date.now() - i.at < INVITE_MS && room && !room.game && room.players.length < MAX_PLAYERS && !room.players.some((p) => p.user === name);
  });
  invites.set(name, list);
  return list;
}

function pushSocial(name) {
  const set = sockets.get(name);
  const soc = store.social(name);
  if (!set || !set.size || !soc) return;
  const msg = {
    t: 'social',
    user: name,
    friends: soc.friends.map((f) => ({ user: f, ...statusOf(f) })),
    incoming: soc.incoming,
    outgoing: soc.outgoing,
    invites: liveInvites(name).map(({ from, code, at }) => ({ from, code, at })),
  };
  for (const ws of set) send(ws, msg);
}

// Avisa el cambio de estado de alguien a sus amigos (y a sí mismo).
function presenceChanged(name) {
  if (!name) return;
  pushSocial(name);
  for (const f of store.social(name)?.friends || []) pushSocial(f);
}

function roomPresence(room) {
  for (const p of room.players) if (p.user) presenceChanged(p.user);
}

function notice(ws, msg) {
  send(ws, { t: 'notice', msg });
}

function handleSocial(ws, m) {
  const fail = (msg) => send(ws, { t: 'error', msg });

  if (m.t === 'register' || m.t === 'login') {
    const name = String(m.user || '').trim();
    const k = name.toLowerCase();
    const lock = loginFails.get(k);
    if (lock && lock.until > Date.now()) return fail('Demasiados intentos. Probá de nuevo en unos minutos.'), true;
    const r = m.t === 'register' ? store.register(name, m.pass) : store.login(name, m.pass);
    if (r.error) {
      if (m.t === 'login') {
        const f = loginFails.get(k) || { n: 0, until: 0 };
        f.n++;
        if (f.n >= 8) {
          f.n = 0;
          f.until = Date.now() + 5 * 60 * 1000;
        }
        loginFails.set(k, f);
      }
      return send(ws, { t: 'authError', msg: r.error }), true;
    }
    loginFails.delete(k);
    setUser(ws, r.user);
    send(ws, { t: 'auth', user: r.user, token: r.token });
    presenceChanged(r.user);
    return true;
  }

  if (m.t === 'auth') {
    const name = store.resume(m.token);
    if (!name) return send(ws, { t: 'authFail' }), true;
    setUser(ws, name);
    send(ws, { t: 'auth', user: name });
    presenceChanged(name);
    return true;
  }

  if (m.t === 'logout') {
    const name = ws.user;
    store.logout(m.token);
    setUser(ws, null);
    send(ws, { t: 'loggedOut' });
    presenceChanged(name);
    return true;
  }

  const SOCIAL = ['friendReq', 'friendRes', 'unfriend', 'invite', 'dismissInvite', 'social'];
  if (!SOCIAL.includes(m.t)) return false;
  if (!ws.user) return fail('Entrá con tu cuenta para usar amigos.'), true;
  const me = ws.user;

  if (m.t === 'social') return pushSocial(me), true;

  if (m.t === 'friendReq') {
    const r = store.request(me, m.to);
    if (r.error) return fail(r.error), true;
    notice(ws, r.ok === 'accepted' ? `Ahora son amigos con ${r.other}.` : `Solicitud enviada a ${r.other}.`);
    for (const q of sockets.get(r.other) || []) send(q, { t: 'friendPing', from: me, kind: r.ok });
    presenceChanged(me);
    presenceChanged(r.other);
    return true;
  }

  if (m.t === 'friendRes') {
    const r = store.respond(me, m.from, !!m.accept);
    if (r.error) return fail(r.error), true;
    if (r.ok === 'accepted') for (const q of sockets.get(r.other) || []) send(q, { t: 'friendPing', from: me, kind: 'accepted' });
    presenceChanged(me);
    presenceChanged(r.other);
    return true;
  }

  if (m.t === 'unfriend') {
    const r = store.unfriend(me, m.user);
    if (r.error) return fail(r.error), true;
    presenceChanged(me);
    presenceChanged(r.other);
    return true;
  }

  if (m.t === 'invite') {
    const room = ws.room;
    const to = store.displayName(m.to);
    if (!to || !store.areFriends(me, to)) return fail('Solo podés invitar a tus amigos.'), true;
    if (!room || room.game || !room.players.some((p) => p.ws === ws)) return fail('Invitá desde una sala que todavía no empezó.'), true;
    if (room.players.length >= MAX_PLAYERS) return fail('La sala está llena.'), true;
    if (statusOf(to).status === 'offline') return fail(`${to} no está conectado.`), true;
    const list = (invites.get(to) || []).filter((i) => i.from !== me);
    list.push({ from: me, code: room.code, at: Date.now() });
    invites.set(to, list.slice(-10));
    for (const q of sockets.get(to) || []) send(q, { t: 'invited', from: me, code: room.code });
    pushSocial(to);
    notice(ws, `Invitación enviada a ${to}.`);
    return true;
  }

  if (m.t === 'dismissInvite') {
    invites.set(me, (invites.get(me) || []).filter((i) => !(i.from === m.from && i.code === m.code)));
    pushSocial(me);
    return true;
  }
  return false;
}

// Identifica la versión del cliente: si cambia, las pestañas abiertas se recargan.
let BUILD = 'dev';
try {
  BUILD = crypto.createHash('sha1').update(fs.readFileSync(path.join(DIST, 'index.html'))).digest('hex').slice(0, 10);
} catch {}

function newCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    const code = [...Array(4)].map(() => abc[crypto.randomInt(abc.length)]).join('');
    if (!rooms.has(code)) return code;
  }
}

const send = (ws, msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));
const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Jugador';

function broadcast(room) {
  room.touched = Date.now();
  room.players.forEach((p, i) => {
    if (!p.ws) return;
    if (!room.game) {
      send(p.ws, {
        t: 'lobby',
        code: room.code,
        you: i,
        players: room.players.map((q, k) => ({ name: q.name, color: q.color, online: !!q.ws, ready: k === 0 || q.ready, user: q.user || null })),
        settings: room.settings,
      });
      return;
    }
    const withBoard = p.ws.boardFor !== room.game.gameId;
    p.ws.boardFor = room.game.gameId;
    send(p.ws, {
      t: 'state',
      code: room.code,
      you: i,
      online: room.players.map((q) => !!q.ws),
      accounts: room.players.map((q) => q.user || null),
      settings: room.settings,
      timer: room.deadline ? { deadline: room.deadline, total: room.timerTotal, stage: timerStage(room.game) } : null,
      now: Date.now(),
      paused: room.paused || null,
      s: viewFor(room.game, i, withBoard, { hideBank: !room.settings.showBank }),
    });
  });
}

// ---------- Reloj de turno ----------

// Tiempo de la etapa actual: tirar y descartar siempre tienen reloj; el
// turno, solo si la sala eligió un tiempo.
function stageMs(room) {
  const g = room.game;
  if (g.phase === 'play') {
    const st = timerStage(g);
    if (st === 'roll') return ROLL_MS;
    if (st === 'discard') return DISCARD_MS;
  }
  const ms = room.settings.turnSeconds * 1000;
  // Si el jugador de turno no está conectado, su turno se juega solo a los 30 s.
  if (!room.players[g.turn]?.ws) return ms ? Math.min(ms, OFFLINE_MS) : OFFLINE_MS;
  return ms;
}

function schedule(room) {
  clearTimeout(room.timer);
  room.timer = null;
  if (room.paused) return;
  const g = room.game;
  const ms = g && g.phase !== 'ended' ? stageMs(room) : 0;
  if (!ms) {
    room.deadline = null;
    room.turnKey = null;
    return;
  }
  const key = timerKey(g);
  if (key !== room.turnKey || !room.deadline) {
    room.turnKey = key;
    room.deadline = Date.now() + ms;
    room.timerTotal = ms;
  }
  // Con nadie conectado, el reloj se detiene; arranca de nuevo al volver alguien.
  if (!room.players.some((p) => p.ws)) {
    room.deadline = null;
    return;
  }
  room.timer = setTimeout(() => onTimeout(room), Math.max(0, room.deadline - Date.now()));
}

function onTimeout(room) {
  room.timer = null;
  if (!room.game || room.game.phase === 'ended') return;
  newFlows(room.game);
  timeoutStage(room.game);
  schedule(room);
  broadcast(room);
}

function addBonus(room) {
  const secs = room.settings.turnSeconds;
  if (!room.deadline || !secs || timerStage(room.game) !== 'turn') return;
  room.deadline = Math.min(room.deadline + BONUS_MS, Date.now() + secs * 1000);
}

function removeFromLobby(room, p) {
  const i = room.players.indexOf(p);
  if (i < 0) return;
  room.players.splice(i, 1);
  room.players.forEach((q, k) => q.ws && (q.ws.index = k));
  broadcast(room);
  if (p.user) presenceChanged(p.user);
}

function attach(ws, room, index) {
  const p = room.players[index];
  if (p.ws && p.ws !== ws) p.ws.close();
  p.ws = ws;
  ws.room = room;
  ws.index = index;
  ws.boardFor = null;
  send(ws, { t: 'joined', code: room.code, token: p.token });
  send(ws, { t: 'chatlog', list: room.chat });
  if (room.game && !room.timer) schedule(room);
  broadcast(room);
}

function handle(ws, m) {
  const fail = (msg) => send(ws, { t: 'error', msg });
  if (handleSocial(ws, m)) return;

  if (m.t === 'create' || m.t === 'join') {
    let room;
    if (m.t === 'create') {
      room = { code: newCode(), players: [], game: null, touched: Date.now(), settings: { turnSeconds: 0, showBank: true }, chat: [], timer: null, deadline: null, turnKey: null };
      rooms.set(room.code, room);
    } else {
      room = rooms.get(String(m.code || '').toUpperCase());
      if (!room) return fail('No existe esa sala.');
      if (room.game) return fail('La partida ya empezó.');
      if (room.players.length >= MAX_PLAYERS) return fail('La sala está llena.');
    }
    const used = new Set(room.players.map((p) => p.color));
    if (ws.user && room.players.some((p) => p.user === ws.user)) return fail('Ya estás en esa sala desde otra pestaña.');
    room.players.push({
      // Con cuenta, el nombre en la sala es el de la cuenta.
      name: ws.user || cleanName(m.name),
      user: ws.user || null,
      color: COLORS.find((c) => !used.has(c)),
      ready: false,
      token: crypto.randomBytes(12).toString('hex'),
      ws: null,
    });
    attach(ws, room, room.players.length - 1);
    if (ws.user) {
      invites.set(ws.user, (invites.get(ws.user) || []).filter((i) => i.code !== room.code));
      presenceChanged(ws.user);
    }
    return;
  }

  if (m.t === 'rejoin') {
    const room = rooms.get(String(m.code || '').toUpperCase());
    const index = room ? room.players.findIndex((p) => p.token === m.token) : -1;
    if (index < 0) return send(ws, { t: 'gone' });
    attach(ws, room, index);
    return presenceChanged(ws.user);
  }

  const room = ws.room;
  if (!room) return fail('No estás en una sala.');

  // Salir de la sala de espera a propósito: el lugar se libera en el momento.
  if (m.t === 'leaveRoom') {
    const p = room.players[ws.index];
    ws.room = null;
    if (p && p.ws === ws) {
      p.ws = null;
      if (!room.game && ws.index !== 0) removeFromLobby(room, p);
      else broadcast(room);
    }
    return presenceChanged(ws.user);
  }

  if (m.t === 'chat') {
    const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const now = Date.now();
    if (!text || now - (ws.lastChat || 0) < 400) return;
    ws.lastChat = now;
    const p = room.players[ws.index];
    const msg = { from: ws.index, name: p.name, color: p.color, text, ts: now };
    room.chat.push(msg);
    if (room.chat.length > CHAT_MAX) room.chat.shift();
    for (const q of room.players) send(q.ws, { t: 'chat', m: msg });
    return;
  }

  if (m.t === 'settings') {
    if (ws.index !== 0) return fail('Solo quien creó la sala cambia la configuración.');
    if (room.game && room.game.phase !== 'ended') return fail('La partida ya empezó.');
    if (m.turnSeconds !== undefined) {
      const secs = Number(m.turnSeconds);
      if (!TURN_OPTIONS.includes(secs)) return fail('Tiempo inválido.');
      room.settings.turnSeconds = secs;
    }
    if (m.showBank !== undefined) room.settings.showBank = !!m.showBank;
    return broadcast(room);
  }

  if (m.t === 'ready') {
    if (room.game) return;
    room.players[ws.index].ready = !!m.v;
    return broadcast(room);
  }

  if (m.t === 'start') {
    if (ws.index !== 0) return fail('Solo quien creó la sala puede empezar.');
    if (room.game && room.game.phase !== 'ended') return fail('La partida ya empezó.');
    if (room.players.length < 2) return fail('Hacen falta al menos 2 jugadores.');
    if (!room.game && room.players.some((p, k) => k > 0 && !p.ready)) return fail('Todavía no están todos listos.');
    room.game = createGame(room.players);
    setTimeout(() => roomPresence(room), 0);
    room.paused = null;
    room.pausedLeft = null;
    room.turnKey = null;
    room.deadline = null;
    schedule(room);
    return broadcast(room);
  }

  if (m.t === 'pause') {
    const g = room.game;
    if (!g || g.phase === 'ended') return;
    if (m.v && !room.paused) {
      // Se congela el reloj: se guarda cuánto quedaba.
      room.paused = { by: ws.index, name: room.players[ws.index].name };
      room.pausedLeft = room.deadline ? Math.max(1000, room.deadline - Date.now()) : null;
      clearTimeout(room.timer);
      room.timer = null;
      room.deadline = null;
      g.log.push(`${room.players[ws.index].name} pausó la partida.`);
    } else if (!m.v && room.paused) {
      room.paused = null;
      if (room.pausedLeft) room.deadline = Date.now() + room.pausedLeft;
      room.pausedLeft = null;
      g.log.push(`${room.players[ws.index].name} reanudó la partida.`);
      schedule(room);
    }
    return broadcast(room);
  }

  if (m.t === 'act') {
    if (!room.game) return fail('La partida no empezó.');
    if (room.paused) return fail(`La partida está en pausa (la pausó ${room.paused.name}).`);
    const g = room.game;
    // El jugador de turno y el del turno compartido suman tiempo para los dos.
    const wasTurn = (g.turn === ws.index || g.partner?.id === ws.index) && g.phase === 'play';
    newFlows(g);
    const r = applyAction(g, ws.index, m.a);
    if (r.error) return fail(r.error);
    if (g.phase === 'ended') setTimeout(() => roomPresence(room), 0);
    if (wasTurn && m.a && BONUS_ACTIONS.has(m.a.type)) addBonus(room);
    schedule(room);
    return broadcast(room);
  }
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  send(ws, { t: 'hello', build: BUILD });
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    try {
      handle(ws, m);
    } catch (e) {
      console.error(e);
      send(ws, { t: 'error', msg: 'Error del servidor.' });
    }
  });
  ws.on('close', () => {
    const user = ws.user;
    setUser(ws, null);
    if (user) setTimeout(() => presenceChanged(user), 0);
    const room = ws.room;
    if (!room) return;
    const p = room.players[ws.index];
    if (p && p.ws === ws) {
      p.ws = null;
      // En la sala de espera, si alguien se desconecta (o recarga) se le guarda
      // el lugar un rato; si no vuelve, se libera.
      if (!room.game && ws.index !== 0) {
        setTimeout(() => {
          if (p.ws || room.game || !room.players.includes(p)) return;
          removeFromLobby(room, p);
        }, LOBBY_GRACE_MS);
      }
      if (room.game) schedule(room);
      broadcast(room);
    }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) ws.terminate();
    else {
      ws.alive = false;
      ws.ping();
    }
  }
  // Salas vacías por más de 2 horas se descartan.
  for (const [code, room] of rooms) {
    if (!room.players.some((p) => p.ws) && Date.now() - room.touched > 2 * 3600 * 1000) {
      clearTimeout(room.timer);
      rooms.delete(code);
    }
  }
}, 30000);

// Al apagar (deploy), guardar las cuentas antes de salir.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    store.flush();
    process.exit(0);
  });
}

server.listen(PORT, () => console.log(`Litoral escuchando en http://localhost:${PORT}`));

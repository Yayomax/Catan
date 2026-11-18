// Servidor de Litoral: sirve el cliente compilado y maneja las salas por WebSocket.
// El servidor es la autoridad: los clientes solo mandan intenciones.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createGame, applyAction, viewFor, timeoutTurn, turnKey, newFlows } from '../shared/game.js';

const PORT = Number(process.env.PORT) || 3001;
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const COLORS = ['#c8402f', '#2f6fb5', '#e3a21a', '#ece6d6', '#3c9a5f', '#8456b0'];
const MAX_PLAYERS = 6;
const TURN_OPTIONS = [0, 30, 60, 90, 120, 180]; // segundos; 0 = sin límite
const BONUS_MS = 10000;
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
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  fs.readFile(file, (e, data) => {
    if (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Falta compilar el cliente: npm run build');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const rooms = new Map();

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
        players: room.players.map((q, k) => ({ name: q.name, color: q.color, online: !!q.ws, ready: k === 0 || q.ready })),
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
      settings: room.settings,
      timer: room.deadline ? { deadline: room.deadline, total: room.settings.turnSeconds * 1000 } : null,
      now: Date.now(),
      s: viewFor(room.game, i, withBoard, { hideBank: !room.settings.showBank }),
    });
  });
}

// ---------- Reloj de turno ----------

function schedule(room) {
  clearTimeout(room.timer);
  room.timer = null;
  const g = room.game;
  const secs = room.settings.turnSeconds;
  if (!g || !secs || g.phase === 'ended') {
    room.deadline = null;
    room.turnKey = null;
    return;
  }
  const key = turnKey(g);
  if (key !== room.turnKey || !room.deadline) {
    room.turnKey = key;
    room.deadline = Date.now() + secs * 1000;
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
  timeoutTurn(room.game);
  schedule(room);
  broadcast(room);
}

function addBonus(room) {
  const secs = room.settings.turnSeconds;
  if (!room.deadline || !secs) return;
  room.deadline = Math.min(room.deadline + BONUS_MS, Date.now() + secs * 1000);
}

function attach(ws, room, index) {
  const p = room.players[index];
  if (p.ws && p.ws !== ws) p.ws.close();
  p.ws = ws;
  ws.room = room;
  ws.index = index;
  ws.boardFor = null;
  send(ws, { t: 'joined', code: room.code, token: p.token });
  if (room.game && !room.timer) schedule(room);
  broadcast(room);
}

function handle(ws, m) {
  const fail = (msg) => send(ws, { t: 'error', msg });

  if (m.t === 'create' || m.t === 'join') {
    let room;
    if (m.t === 'create') {
      room = { code: newCode(), players: [], game: null, touched: Date.now(), settings: { turnSeconds: 0, showBank: true }, timer: null, deadline: null, turnKey: null };
      rooms.set(room.code, room);
    } else {
      room = rooms.get(String(m.code || '').toUpperCase());
      if (!room) return fail('No existe esa sala.');
      if (room.game) return fail('La partida ya empezó.');
      if (room.players.length >= MAX_PLAYERS) return fail('La sala está llena.');
    }
    const used = new Set(room.players.map((p) => p.color));
    room.players.push({
      name: cleanName(m.name),
      color: COLORS.find((c) => !used.has(c)),
      ready: false,
      token: crypto.randomBytes(12).toString('hex'),
      ws: null,
    });
    return attach(ws, room, room.players.length - 1);
  }

  if (m.t === 'rejoin') {
    const room = rooms.get(String(m.code || '').toUpperCase());
    const index = room ? room.players.findIndex((p) => p.token === m.token) : -1;
    if (index < 0) return send(ws, { t: 'gone' });
    return attach(ws, room, index);
  }

  const room = ws.room;
  if (!room) return fail('No estás en una sala.');

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
    room.turnKey = null;
    room.deadline = null;
    schedule(room);
    return broadcast(room);
  }

  if (m.t === 'act') {
    if (!room.game) return fail('La partida no empezó.');
    const g = room.game;
    const wasTurn = g.turn === ws.index && g.phase === 'play';
    newFlows(g);
    const r = applyAction(g, ws.index, m.a);
    if (r.error) return fail(r.error);
    if (wasTurn && m.a && BONUS_ACTIONS.has(m.a.type)) addBonus(room);
    schedule(room);
    return broadcast(room);
  }
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
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
    const room = ws.room;
    if (!room) return;
    const p = room.players[ws.index];
    if (p && p.ws === ws) {
      p.ws = null;
      // En la sala de espera, quien se va libera su lugar.
      if (!room.game && ws.index !== 0) room.players.splice(ws.index, 1);
      room.players.forEach((q, i) => q.ws && (q.ws.index = i));
      if (room.game && !room.players.some((q) => q.ws)) schedule(room);
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

server.listen(PORT, () => console.log(`Litoral escuchando en http://localhost:${PORT}`));

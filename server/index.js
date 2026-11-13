// Servidor de Litoral: sirve el cliente compilado y maneja las salas por WebSocket.
// El servidor es la autoridad: los clientes solo mandan intenciones.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createGame, applyAction, viewFor } from '../shared/game.js';

const PORT = Number(process.env.PORT) || 3001;
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const COLORS = ['#c8402f', '#2f6fb5', '#e3a21a', '#ece6d6', '#3c9a5f', '#8456b0'];
const MAX_PLAYERS = 6;
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
        players: room.players.map((q) => ({ name: q.name, color: q.color, online: !!q.ws })),
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
      s: viewFor(room.game, i, withBoard),
    });
  });
}

function attach(ws, room, index) {
  const p = room.players[index];
  if (p.ws && p.ws !== ws) p.ws.close();
  p.ws = ws;
  ws.room = room;
  ws.index = index;
  ws.boardFor = null;
  send(ws, { t: 'joined', code: room.code, token: p.token });
  broadcast(room);
}

function handle(ws, m) {
  const fail = (msg) => send(ws, { t: 'error', msg });

  if (m.t === 'create' || m.t === 'join') {
    let room;
    if (m.t === 'create') {
      room = { code: newCode(), players: [], game: null, touched: Date.now() };
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

  if (m.t === 'start') {
    if (ws.index !== 0) return fail('Solo quien creó la sala puede empezar.');
    if (room.game && room.game.phase !== 'ended') return fail('La partida ya empezó.');
    if (room.players.length < 2) return fail('Hacen falta al menos 2 jugadores.');
    room.game = createGame(room.players);
    return broadcast(room);
  }

  if (m.t === 'act') {
    if (!room.game) return fail('La partida no empezó.');
    const r = applyAction(room.game, ws.index, m.a);
    if (r.error) return fail(r.error);
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
    if (!room.players.some((p) => p.ws) && Date.now() - room.touched > 2 * 3600 * 1000) rooms.delete(code);
  }
}, 30000);

server.listen(PORT, () => console.log(`Litoral escuchando en http://localhost:${PORT}`));

// Motor de reglas de Litoral. Puro y determinista dado un rng: lo usan el
// servidor (autoridad) y el cliente (para resaltar jugadas válidas).

import { buildBoard, RES, TERRAIN_RES, shuffle } from './board.js';

export { RES, TERRAIN_RES };

export const COSTS = {
  road: { madera: 1, arcilla: 1 },
  settlement: { madera: 1, arcilla: 1, yerba: 1, pescado: 1 },
  city: { pescado: 2, piedra: 3 },
  card: { yerba: 1, pescado: 1, piedra: 1 },
};
export const LIMITS = { road: 15, settlement: 5, city: 4 };
export const WIN_POINTS = 10;
export const CARD_TYPES = ['baqueano', 'picada', 'cosecha', 'feria', 'fiesta'];

const DECK = [
  ...Array(14).fill('baqueano'),
  ...Array(5).fill('fiesta'),
  ...Array(2).fill('picada'),
  ...Array(2).fill('cosecha'),
  ...Array(2).fill('feria'),
];

const zero = () => Object.fromEntries(RES.map((r) => [r, 0]));
const total = (h) => RES.reduce((s, r) => s + (h[r] || 0), 0);
const isCount = (n) => Number.isInteger(n) && n >= 0;

function cleanBundle(b) {
  const out = zero();
  if (!b || typeof b !== 'object') return null;
  for (const r of RES) {
    const n = b[r] ?? 0;
    if (!isCount(n)) return null;
    out[r] = n;
  }
  return out;
}

export function createGame(players, rng = Math.random) {
  const n = players.length;
  const board = buildBoard(rng);
  const order = [...Array(n).keys()];
  return {
    gameId: Math.floor(rng() * 1e9),
    board,
    players: players.map((p, i) => ({
      id: i,
      name: p.name,
      color: p.color,
      hand: zero(),
      dev: [],
      newDev: [],
      guard: 0,
      roadLen: 0,
    })),
    phase: 'setup',
    sub: 'settlement',
    setupQueue: [...order, ...order.slice().reverse()],
    setupVertex: null,
    turn: 0,
    turnCount: 0,
    dice: null,
    rollId: 0,
    jaguar: board.tiles.find((t) => t.terrain === 'estero').id,
    afterJaguar: 'main',
    buildings: {},
    roads: {},
    deck: shuffle(DECK, rng),
    discards: {},
    freeRoads: 0,
    playedCard: false,
    trade: null,
    longest: null,
    largest: null,
    winner: null,
    log: [],
  };
}

// ---------- Consultas (también usadas por el cliente) ----------

export function canAfford(hand, cost) {
  return RES.every((r) => (hand[r] || 0) >= (cost[r] || 0));
}

export function piecesLeft(state, pid) {
  const used = { road: 0, settlement: 0, city: 0 };
  for (const p of Object.values(state.roads)) if (p === pid) used.road++;
  for (const b of Object.values(state.buildings)) if (b.p === pid) used[b.type]++;
  return {
    road: LIMITS.road - used.road,
    settlement: LIMITS.settlement - used.settlement,
    city: LIMITS.city - used.city,
  };
}

function settlementSpotOk(state, v, pid, needRoad) {
  const V = state.board.vertices[v];
  if (!V || state.buildings[v]) return false;
  if (V.adj.some((o) => state.buildings[o])) return false;
  if (needRoad && !V.edges.some((e) => state.roads[e] === pid)) return false;
  return true;
}

function roadSpotOk(state, e, pid) {
  const E = state.board.edges[e];
  if (!E || state.roads[e] !== undefined) return false;
  if (state.phase === 'setup') return E.a === state.setupVertex || E.b === state.setupVertex;
  return [E.a, E.b].some((v) => {
    const b = state.buildings[v];
    if (b) return b.p === pid;
    return state.board.vertices[v].edges.some((o) => o !== e && state.roads[o] === pid);
  });
}

export function validSettlements(state, pid) {
  const needRoad = state.phase !== 'setup';
  return state.board.vertices.filter((v) => settlementSpotOk(state, v.id, pid, needRoad)).map((v) => v.id);
}

export function validRoads(state, pid) {
  return state.board.edges.filter((e) => roadSpotOk(state, e.id, pid)).map((e) => e.id);
}

export function validCities(state, pid) {
  return Object.entries(state.buildings)
    .filter(([, b]) => b.p === pid && b.type === 'settlement')
    .map(([v]) => Number(v));
}

export function validJaguarTiles(state) {
  return state.board.tiles.filter((t) => t.id !== state.jaguar).map((t) => t.id);
}

export function stealCandidates(state, tile, pid) {
  const out = new Set();
  for (const v of state.board.tiles[tile].vertices) {
    const b = state.buildings[v];
    if (b && b.p !== pid && handCount(state.players[b.p]) > 0) out.add(b.p);
  }
  return [...out];
}

export function handCount(player) {
  return player.hand ? total(player.hand) : player.handCount;
}

export function bankRate(state, pid, res) {
  let rate = 4;
  for (const port of state.board.ports) {
    const owns = [port.a, port.b].some((v) => state.buildings[v]?.p === pid);
    if (!owns) continue;
    if (port.type === res) return 2;
    if (port.type === 'any') rate = 3;
  }
  return rate;
}

export function publicPoints(state, pid) {
  let vp = 0;
  for (const b of Object.values(state.buildings)) if (b.p === pid) vp += b.type === 'city' ? 2 : 1;
  if (state.longest === pid) vp += 2;
  if (state.largest === pid) vp += 2;
  return vp;
}

function totalPoints(state, pid) {
  const p = state.players[pid];
  return publicPoints(state, pid) + [...p.dev, ...p.newDev].filter((c) => c === 'fiesta').length;
}

function roadLength(state, pid) {
  const B = state.board;
  const mine = new Set();
  for (const [e, p] of Object.entries(state.roads)) if (p === pid) mine.add(Number(e));
  let best = 0;
  const used = new Set();
  const walk = (v, len) => {
    if (len > best) best = len;
    const b = state.buildings[v];
    if (len > 0 && b && b.p !== pid) return; // un poblado rival corta el camino
    for (const e of B.vertices[v].edges) {
      if (!mine.has(e) || used.has(e)) continue;
      used.add(e);
      const E = B.edges[e];
      walk(E.a === v ? E.b : E.a, len + 1);
      used.delete(e);
    }
  };
  const starts = new Set();
  for (const e of mine) {
    starts.add(B.edges[e].a);
    starts.add(B.edges[e].b);
  }
  for (const v of starts) walk(v, 0);
  return best;
}

// ---------- Mutaciones ----------

function say(state, text) {
  state.log.push(text);
  if (state.log.length > 80) state.log.shift();
}

function pay(player, cost) {
  for (const r of RES) player.hand[r] -= cost[r] || 0;
}

function awardTitle(state, field, stat, min, label) {
  const holder = state[field];
  const best = Math.max(...state.players.map((p) => p[stat]));
  let next = holder;
  if (best < min) next = null;
  else if (holder === null || state.players[holder][stat] < best) {
    const top = state.players.filter((p) => p[stat] === best);
    next = top.length === 1 ? top[0].id : holder !== null && state.players[holder][stat] === best ? holder : null;
  }
  if (next !== holder) {
    state[field] = next;
    if (next !== null) say(state, `${state.players[next].name} se queda con ${label}.`);
  }
}

function refreshRoads(state) {
  for (const p of state.players) p.roadLen = roadLength(state, p.id);
  awardTitle(state, 'longest', 'roadLen', 5, 'la Picada más larga');
}

function checkWin(state) {
  if (state.phase !== 'play') return;
  if (totalPoints(state, state.turn) >= WIN_POINTS) {
    state.phase = 'ended';
    state.winner = state.turn;
    state.trade = null;
    say(state, `¡${state.players[state.turn].name} ganó la partida!`);
  }
}

function produce(state, sum) {
  const gains = state.players.map(() => zero());
  for (const t of state.board.tiles) {
    if (t.number !== sum || t.id === state.jaguar) continue;
    const res = TERRAIN_RES[t.terrain];
    for (const v of t.vertices) {
      const b = state.buildings[v];
      if (b) gains[b.p][res] += b.type === 'city' ? 2 : 1;
    }
  }
  state.players.forEach((p, i) => {
    const parts = RES.filter((r) => gains[i][r]).map((r) => `${gains[i][r]} ${r}`);
    for (const r of RES) p.hand[r] += gains[i][r];
    if (parts.length) say(state, `${p.name} recibe ${parts.join(', ')}.`);
  });
}

const err = (error) => ({ error });
const OK = { ok: true };

export function applyAction(state, pid, a, rng = Math.random) {
  if (!a || typeof a !== 'object') return err('Acción inválida.');
  const me = state.players[pid];
  if (!me) return err('Jugador desconocido.');
  if (state.phase === 'ended') return err('La partida terminó.');

  // Acciones que puede hacer alguien fuera de su turno.
  if (a.type === 'discard') return discard(state, me, a);
  if (a.type === 'respondTrade') return respondTrade(state, me, a);

  if (state.turn !== pid) return err('No es tu turno.');
  const result = turnAction(state, me, a, rng);
  if (result.ok) checkWin(state);
  return result;
}

function discard(state, me, a) {
  const need = state.discards[me.id];
  if (!need) return err('No tenés que descartar.');
  const cards = cleanBundle(a.cards);
  if (!cards || total(cards) !== need || !canAfford(me.hand, cards)) return err(`Tenés que descartar ${need} cartas.`);
  pay(me, cards);
  delete state.discards[me.id];
  say(state, `${me.name} descarta ${need} cartas.`);
  if (!Object.keys(state.discards).length) state.sub = 'jaguar';
  return OK;
}

function respondTrade(state, me, a) {
  const t = state.trade;
  if (!t || t.from === me.id) return err('No hay oferta para responder.');
  if (a.accept && !canAfford(me.hand, t.get)) return err('No tenés esas cartas.');
  t.responses[me.id] = a.accept ? 'accept' : 'reject';
  return OK;
}

function turnAction(state, me, a, rng) {
  const pid = me.id;

  if (state.phase === 'setup') {
    if (a.type === 'buildSettlement' && state.sub === 'settlement') {
      if (!settlementSpotOk(state, a.v, pid, false)) return err('Ahí no se puede.');
      state.buildings[a.v] = { p: pid, type: 'settlement' };
      state.setupVertex = a.v;
      state.sub = 'road';
      if (state.setupQueue.length <= state.players.length) {
        // Segundo rancho: recibe un recurso por cada terreno vecino.
        for (const t of state.board.vertices[a.v].tiles) {
          const res = TERRAIN_RES[state.board.tiles[t].terrain];
          if (res) me.hand[res]++;
        }
      }
      say(state, `${me.name} funda un rancho.`);
      return OK;
    }
    if (a.type === 'buildRoad' && state.sub === 'road') {
      if (!roadSpotOk(state, a.e, pid)) return err('El camino tiene que salir de tu rancho nuevo.');
      state.roads[a.e] = pid;
      state.setupQueue.shift();
      state.setupVertex = null;
      refreshRoads(state);
      if (state.setupQueue.length) {
        state.turn = state.setupQueue[0];
        state.sub = 'settlement';
      } else {
        state.phase = 'play';
        state.sub = 'roll';
        state.turn = 0;
        state.turnCount = 1;
        say(state, 'La isla está poblada. ¡A tirar los dados!');
      }
      return OK;
    }
    return err('Ahora no.');
  }

  switch (a.type) {
    case 'roll': {
      if (state.sub !== 'roll') return err('Ya tiraste.');
      const d = [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
      state.dice = d;
      state.rollId++;
      const sum = d[0] + d[1];
      say(state, `${me.name} tira ${sum}.`);
      if (sum === 7) {
        state.discards = {};
        for (const p of state.players) {
          const n = total(p.hand);
          if (n > 7) state.discards[p.id] = Math.floor(n / 2);
        }
        state.afterJaguar = 'main';
        state.sub = Object.keys(state.discards).length ? 'discard' : 'jaguar';
      } else {
        produce(state, sum);
        state.sub = 'main';
      }
      return OK;
    }

    case 'moveJaguar': {
      if (state.sub !== 'jaguar') return err('Ahora no.');
      const tile = state.board.tiles[a.tile];
      if (!tile || tile.id === state.jaguar) return err('Elegí otro terreno.');
      const cands = stealCandidates(state, tile.id, pid);
      let victim = a.victim;
      if (cands.length === 1) victim = cands[0];
      if (cands.length > 1 && !cands.includes(victim)) return err('Elegí a quién quitarle una carta.');
      state.jaguar = tile.id;
      say(state, `${me.name} mueve el yaguareté.`);
      if (cands.length) {
        const v = state.players[victim];
        const pool = RES.flatMap((r) => Array(v.hand[r]).fill(r));
        const res = pool[Math.floor(rng() * pool.length)];
        v.hand[res]--;
        me.hand[res]++;
        say(state, `${me.name} le quita una carta a ${v.name}.`);
      }
      state.sub = state.afterJaguar;
      return OK;
    }

    case 'buildRoad': {
      if (state.sub !== 'main') return err('Ahora no.');
      const free = state.freeRoads > 0;
      if (piecesLeft(state, pid).road <= 0) return err('No te quedan caminos.');
      if (!free && !canAfford(me.hand, COSTS.road)) return err('No te alcanza.');
      if (!roadSpotOk(state, a.e, pid)) return err('Ahí no se puede.');
      if (free) state.freeRoads--;
      else pay(me, COSTS.road);
      state.roads[a.e] = pid;
      if (state.freeRoads > 0 && (piecesLeft(state, pid).road <= 0 || !validRoads(state, pid).length)) state.freeRoads = 0;
      say(state, `${me.name} abre un camino.`);
      refreshRoads(state);
      return OK;
    }

    case 'buildSettlement': {
      if (state.sub !== 'main' || state.freeRoads) return err('Ahora no.');
      if (piecesLeft(state, pid).settlement <= 0) return err('No te quedan ranchos.');
      if (!canAfford(me.hand, COSTS.settlement)) return err('No te alcanza.');
      if (!settlementSpotOk(state, a.v, pid, true)) return err('Ahí no se puede.');
      pay(me, COSTS.settlement);
      state.buildings[a.v] = { p: pid, type: 'settlement' };
      say(state, `${me.name} funda un rancho.`);
      refreshRoads(state);
      return OK;
    }

    case 'buildCity': {
      if (state.sub !== 'main' || state.freeRoads) return err('Ahora no.');
      if (piecesLeft(state, pid).city <= 0) return err('No te quedan pueblos.');
      if (!canAfford(me.hand, COSTS.city)) return err('No te alcanza.');
      const b = state.buildings[a.v];
      if (!b || b.p !== pid || b.type !== 'settlement') return err('Ahí no hay un rancho tuyo.');
      pay(me, COSTS.city);
      b.type = 'city';
      say(state, `${me.name} levanta un pueblo.`);
      return OK;
    }

    case 'buyCard': {
      if (state.sub !== 'main' || state.freeRoads) return err('Ahora no.');
      if (!state.deck.length) return err('No quedan cartas.');
      if (!canAfford(me.hand, COSTS.card)) return err('No te alcanza.');
      pay(me, COSTS.card);
      me.newDev.push(state.deck.pop());
      say(state, `${me.name} compra una carta de oficio.`);
      return OK;
    }

    case 'playCard': {
      const card = a.card;
      if (state.playedCard) return err('Solo una carta por turno.');
      if (card === 'fiesta' || !me.dev.includes(card)) return err('No podés jugar esa carta.');
      if (state.sub === 'roll' ? card !== 'baqueano' : state.sub !== 'main' || state.freeRoads) return err('Ahora no.');
      if (card === 'baqueano') {
        me.guard++;
        state.afterJaguar = state.sub;
        state.sub = 'jaguar';
        say(state, `${me.name} llama a un baqueano.`);
        awardTitle(state, 'largest', 'guard', 3, 'la Gran baqueanía');
      } else if (card === 'picada') {
        const n = Math.min(2, piecesLeft(state, pid).road);
        if (!n || !validRoads(state, pid).length) return err('No tenés dónde abrir caminos.');
        state.freeRoads = n;
        say(state, `${me.name} abre una picada: ${n} caminos gratis.`);
      } else if (card === 'cosecha') {
        if (!RES.includes(a.a) || !RES.includes(a.b)) return err('Elegí dos recursos.');
        me.hand[a.a]++;
        me.hand[a.b]++;
        say(state, `${me.name} levanta la cosecha: ${a.a} y ${a.b}.`);
      } else if (card === 'feria') {
        if (!RES.includes(a.res)) return err('Elegí un recurso.');
        let got = 0;
        for (const p of state.players) {
          if (p.id === pid) continue;
          got += p.hand[a.res];
          p.hand[a.res] = 0;
        }
        me.hand[a.res] += got;
        say(state, `${me.name} arma la feria y se lleva ${got} de ${a.res}.`);
      } else return err('Carta desconocida.');
      me.dev.splice(me.dev.indexOf(card), 1);
      state.playedCard = true;
      return OK;
    }

    case 'bankTrade': {
      if (state.sub !== 'main' || state.freeRoads) return err('Ahora no.');
      const n = a.n ?? 1;
      if (!RES.includes(a.give) || !RES.includes(a.get) || a.give === a.get || !isCount(n) || n < 1) return err('Cambio inválido.');
      const rate = bankRate(state, pid, a.give);
      if (me.hand[a.give] < rate * n) return err('No te alcanza.');
      me.hand[a.give] -= rate * n;
      me.hand[a.get] += n;
      say(state, `${me.name} cambia ${rate * n} ${a.give} por ${n} ${a.get} en el puerto.`);
      return OK;
    }

    case 'offerTrade': {
      if (state.sub !== 'main' || state.freeRoads) return err('Ahora no.');
      const give = cleanBundle(a.give);
      const get = cleanBundle(a.get);
      if (!give || !get || !total(give) || !total(get)) return err('La oferta tiene que dar y pedir algo.');
      if (RES.some((r) => give[r] && get[r])) return err('No podés dar y pedir lo mismo.');
      if (!canAfford(me.hand, give)) return err('No tenés esas cartas.');
      state.trade = { from: pid, give, get, responses: {} };
      say(state, `${me.name} propone un trueque.`);
      return OK;
    }

    case 'acceptTrade': {
      const t = state.trade;
      const other = state.players[a.with];
      if (!t || !other || t.responses[other.id] !== 'accept') return err('Ese jugador no aceptó.');
      if (!canAfford(me.hand, t.give) || !canAfford(other.hand, t.get)) {
        state.trade = null;
        return err('Ya no alcanzan las cartas.');
      }
      for (const r of RES) {
        me.hand[r] += t.get[r] - t.give[r];
        other.hand[r] += t.give[r] - t.get[r];
      }
      state.trade = null;
      say(state, `${me.name} y ${other.name} cierran un trueque.`);
      return OK;
    }

    case 'cancelTrade':
      state.trade = null;
      return OK;

    case 'endTurn': {
      if (state.sub !== 'main') return err('Todavía no podés terminar.');
      me.dev.push(...me.newDev);
      me.newDev = [];
      state.freeRoads = 0;
      state.playedCard = false;
      state.trade = null;
      state.turn = (state.turn + 1) % state.players.length;
      state.turnCount++;
      state.sub = 'roll';
      return OK;
    }
  }
  return err('Acción desconocida.');
}

// Estado tal como lo ve un jugador: sin manos ajenas ni mazo.
export function viewFor(state, pid, withBoard) {
  const { board, deck, players, ...rest } = state;
  return {
    ...rest,
    board: withBoard ? board : undefined,
    deckCount: deck.length,
    players: players.map((p) => {
      const base = {
        id: p.id,
        name: p.name,
        color: p.color,
        guard: p.guard,
        roadLen: p.roadLen,
        handCount: total(p.hand),
        devCount: p.dev.length + p.newDev.length,
        points: publicPoints(state, p.id),
      };
      if (p.id === pid || state.phase === 'ended') {
        Object.assign(base, { hand: p.hand, dev: p.dev, newDev: p.newDev, points: totalPoints(state, p.id) });
      }
      return base;
    }),
  };
}

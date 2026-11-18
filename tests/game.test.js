import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, applyAction, viewFor, validSettlements, validRoads, validCities,
  validJaguarTiles, stealCandidates, canAfford, bankRate, COSTS, RES, WIN_POINTS, timeoutTurn, turnKey,
} from '../shared/game.js';
import { buildBoard, spiralOrder } from '../shared/board.js';

function rngFrom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const mk = (n, seed = 1) =>
  createGame([...Array(n)].map((_, i) => ({ name: `J${i}`, color: '#000' })), rngFrom(seed));

function must(state, pid, action, rng) {
  const r = applyAction(state, pid, action, rng);
  assert.ok(r.ok, `${JSON.stringify(action)} -> ${r.error}`);
}

function doSetup(state, rng) {
  while (state.phase === 'setup') {
    const p = state.turn;
    must(state, p, { type: 'buildSettlement', v: validSettlements(state, p)[0] }, rng);
    must(state, p, { type: 'buildRoad', e: validRoads(state, p)[0] }, rng);
  }
}

const count = (arr) => arr.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});

test('tablero base (2 a 4): 19 terrenos, 1 desierto, 18 fichas y 9 puertos', () => {
  for (let seed = 1; seed < 40; seed++) {
    const b = buildBoard(rngFrom(seed), 2 + (seed % 3));
    assert.equal(b.tiles.length, 19);
    assert.deepEqual(count(b.tiles.map((t) => t.terrain)), { bosque: 4, pradera: 4, campo: 4, colina: 3, montana: 3, desierto: 1 });
    const nums = b.tiles.map((t) => t.number).filter(Boolean);
    assert.deepEqual(count(nums), { 2: 1, 3: 2, 4: 2, 5: 2, 6: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 1 });
    assert.equal(b.tiles.find((t) => t.terrain === 'desierto').number, null);
    assert.deepEqual(count(b.ports.map((p) => p.type)), { any: 4, madera: 1, ladrillo: 1, lana: 1, trigo: 1, piedra: 1 });
    assert.equal(new Set(b.ports.map((p) => p.edge)).size, 9);
    for (const v of b.vertices) assert.ok(v.adj.length >= 2 && v.adj.length <= 3);
  }
});

test('las fichas del tablero base van en espiral A–R y sin 6/8 pegados', () => {
  const A_R = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];
  for (let seed = 1; seed < 40; seed++) {
    const b = buildBoard(rngFrom(seed), 4);
    const nb = b.tiles.map(() => new Set());
    for (const e of b.edges) if (e.tiles.length === 2) {
      nb[e.tiles[0]].add(e.tiles[1]);
      nb[e.tiles[1]].add(e.tiles[0]);
    }
    // Existe una esquina desde la que la espiral reproduce A–R.
    const ok = b.tiles.filter((t) => nb[t.id].size === 3).some((c) => {
      const order = spiralOrder(b.tiles, nb, c.id);
      for (let i = 1; i < order.length; i++) if (!nb[order[i - 1]].has(order[i])) return false;
      const seq = order.map((id) => b.tiles[id].number).filter(Boolean);
      return seq.join() === A_R.join();
    });
    assert.ok(ok, `seed ${seed}: las fichas no siguen la espiral`);
    for (const e of b.edges) {
      if (e.tiles.length < 2) continue;
      const [x, y] = e.tiles.map((t) => b.tiles[t].number);
      assert.ok(!([6, 8].includes(x) && [6, 8].includes(y)), '6/8 pegados');
    }
  }
});

test('tablero grande (5 a 6): 30 terrenos, 2 desiertos, 28 fichas, 11 puertos y 34 cartas', () => {
  for (let seed = 1; seed < 20; seed++) {
    const b = buildBoard(rngFrom(seed), 5 + (seed % 2));
    assert.equal(b.tiles.length, 30);
    assert.deepEqual(count(b.tiles.map((t) => t.terrain)), { bosque: 6, pradera: 6, campo: 6, colina: 5, montana: 5, desierto: 2 });
    assert.equal(b.tiles.filter((t) => t.number).length, 28);
    assert.deepEqual(count(b.ports.map((p) => p.type)), { any: 5, madera: 1, ladrillo: 1, lana: 2, trigo: 1, piedra: 1 });
  }
  assert.equal(viewFor(mk(6), 0).deckCount, 34);
  assert.equal(viewFor(mk(4), 0).deckCount, 25);
});

test('la preparación va en serpiente y el segundo rancho da recursos', () => {
  const rng = rngFrom(3);
  const s = mk(3, 3);
  assert.deepEqual(s.setupQueue, [0, 1, 2, 2, 1, 0]);
  doSetup(s, rng);
  assert.equal(s.phase, 'play');
  assert.equal(s.turn, 0);
  assert.equal(Object.keys(s.buildings).length, 6);
  assert.equal(Object.keys(s.roads).length, 6);
  for (const p of s.players) assert.ok(RES.reduce((n, r) => n + p.hand[r], 0) <= 3);
});

test('regla de distancia y turnos', () => {
  const rng = rngFrom(5);
  const s = mk(2, 5);
  const v = validSettlements(s, 0)[0];
  assert.ok(applyAction(s, 1, { type: 'buildSettlement', v }, rng).error);
  must(s, 0, { type: 'buildSettlement', v }, rng);
  for (const o of s.board.vertices[v].adj) assert.ok(!validSettlements(s, 0).includes(o));
  assert.ok(validRoads(s, 0).every((e) => [s.board.edges[e].a, s.board.edges[e].b].includes(v)));
});

test('con un 7 se descarta la mitad y se mueve el yaguareté', () => {
  const rng = rngFrom(7);
  const s = mk(2, 7);
  doSetup(s, rng);
  s.players[1].hand = { madera: 9, ladrillo: 0, lana: 0, trigo: 0, piedra: 0 };
  const seven = (() => {
    const seq = [0, 0.99];
    let i = 0;
    return () => seq[i++ % 2];
  })();
  must(s, 0, { type: 'roll' }, seven);
  assert.equal(s.sub, 'discard');
  assert.equal(s.discards[1], 4);
  assert.ok(applyAction(s, 1, { type: 'discard', cards: { madera: 3 } }, rng).error);
  must(s, 1, { type: 'discard', cards: { madera: 4 } }, rng);
  assert.equal(s.sub, 'jaguar');
  const tile = s.board.tiles.find((t) => t.id !== s.jaguar && stealCandidates(s, t.id, 0).length);
  must(s, 0, { type: 'moveJaguar', tile: tile.id }, rng);
  assert.equal(s.players[1].hand.madera, 4);
  assert.equal(s.players[0].hand.madera >= 1, true);
  assert.equal(s.sub, 'main');
});

test('trueque entre jugadores y cambio en el puerto', () => {
  const rng = rngFrom(9);
  const s = mk(3, 9);
  doSetup(s, rng);
  s.sub = 'main';
  s.players[0].hand = { madera: 4, ladrillo: 0, lana: 0, trigo: 0, piedra: 0 };
  s.players[1].hand = { madera: 0, ladrillo: 2, lana: 0, trigo: 0, piedra: 0 };
  must(s, 0, { type: 'offerTrade', give: { madera: 1 }, get: { ladrillo: 2 } }, rng);
  assert.ok(applyAction(s, 2, { type: 'respondTrade', accept: true }, rng).error);
  must(s, 1, { type: 'respondTrade', accept: true }, rng);
  assert.ok(applyAction(s, 0, { type: 'acceptTrade', with: 2 }, rng).error);
  must(s, 0, { type: 'acceptTrade', with: 1 }, rng);
  assert.equal(s.players[0].hand.ladrillo, 2);
  assert.equal(s.players[1].hand.madera, 1);
  const rate = bankRate(s, 0, 'madera');
  s.players[0].hand.madera = rate;
  must(s, 0, { type: 'bankTrade', give: 'madera', get: 'piedra', n: 1 }, rng);
  assert.equal(s.players[0].hand.madera, 0);
  assert.equal(s.players[0].hand.piedra, 1);
});

test('la vista oculta las manos ajenas y el mazo', () => {
  const rng = rngFrom(11);
  const s = mk(2, 11);
  doSetup(s, rng);
  const v = viewFor(s, 0, true);
  assert.ok(v.players[0].hand);
  assert.equal(v.players[1].hand, undefined);
  assert.equal(v.deck, undefined);
  assert.equal(v.deckCount, 25);
  assert.ok(v.board);
  assert.equal(viewFor(s, 0, false).board, undefined);
});

test('partidas completas al azar terminan con un ganador válido', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const rng = rngFrom(seed * 77);
    const n = 2 + (seed % 5);
    const s = mk(n, seed);
    doSetup(s, rng);
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    let guard = 0;
    while (s.phase === 'play' && guard++ < 20000) {
      const p = s.turn;
      const me = s.players[p];
      if (s.sub === 'roll') {
        if (me.dev.includes('baqueano') && !s.playedCard && rng() < 0.3) must(s, p, { type: 'playCard', card: 'baqueano' }, rng);
        else must(s, p, { type: 'roll' }, rng);
      } else if (s.sub === 'discard') {
        for (const [id, need] of Object.entries(s.discards)) {
          const pl = s.players[id];
          const cards = Object.fromEntries(RES.map((r) => [r, 0]));
          let left = need;
          for (const r of RES) {
            const k = Math.min(left, pl.hand[r]);
            cards[r] = k;
            left -= k;
          }
          must(s, Number(id), { type: 'discard', cards }, rng);
        }
      } else if (s.sub === 'jaguar') {
        const tile = pick(validJaguarTiles(s));
        const c = stealCandidates(s, tile, p);
        must(s, p, { type: 'moveJaguar', tile, victim: c.length ? pick(c) : undefined }, rng);
      } else {
        if (s.freeRoads) {
          must(s, p, { type: 'buildRoad', e: pick(validRoads(s, p)) }, rng);
          continue;
        }
        const cities = validCities(s, p);
        const spots = validSettlements(s, p);
        const roads = validRoads(s, p);
        const playable = me.dev.filter((c) => c !== 'fiesta');
        if (canAfford(me.hand, COSTS.city) && cities.length && applyAction(s, p, { type: 'buildCity', v: pick(cities) }, rng).ok) continue;
        if (canAfford(me.hand, COSTS.settlement) && spots.length && applyAction(s, p, { type: 'buildSettlement', v: pick(spots) }, rng).ok) continue;
        if (canAfford(me.hand, COSTS.road) && roads.length && rng() < 0.6 && applyAction(s, p, { type: 'buildRoad', e: pick(roads) }, rng).ok) continue;
        if (canAfford(me.hand, COSTS.card) && s.deck.length && rng() < 0.5) {
          must(s, p, { type: 'buyCard' }, rng);
          continue;
        }
        if (playable.length && !s.playedCard) {
          const card = pick(playable);
          const r = applyAction(s, p, { type: 'playCard', card, a: pick(RES), b: pick(RES), res: pick(RES) }, rng);
          if (r.ok) continue;
        }
        const rich = RES.find((r) => me.hand[r] >= bankRate(s, p, r) + 2);
        if (rich) {
          const poor = RES.filter((r) => r !== rich).sort((x, y) => me.hand[x] - me.hand[y])[0];
          must(s, p, { type: 'bankTrade', give: rich, get: poor, n: 1 }, rng);
          continue;
        }
        must(s, p, { type: 'endTurn' }, rng);
      }
      for (const pl of s.players) for (const r of RES) assert.ok(pl.hand[r] >= 0, 'mano negativa');
      const size = n > 4 ? 24 : 19;
      for (const r of RES) {
        assert.ok(s.bank[r] >= 0, 'banco negativo');
        assert.equal(s.bank[r] + s.players.reduce((k, pl) => k + pl.hand[r], 0), size, `se perdieron o crearon cartas de ${r}`);
      }
    }
    assert.equal(s.phase, 'ended', `seed ${seed} no terminó`);
    assert.ok(viewFor(s, 0).players[s.winner].points >= WIN_POINTS);
    assert.ok(applyAction(s, s.turn, { type: 'endTurn' }, rng).error);
  }
});

test('si se acaba el tiempo, el juego completa lo mínimo y pasa el turno', () => {
  const rng = rngFrom(21);
  const s = mk(3, 21);
  // Colocación inicial completa solo con tiempos agotados.
  let guard = 0;
  while (s.phase === 'setup' && guard++ < 20) timeoutTurn(s, rng);
  assert.equal(s.phase, 'play');
  assert.equal(Object.keys(s.buildings).length, 6);
  assert.equal(Object.keys(s.roads).length, 6);

  // Sin tirar: tira y pasa.
  const before = s.turn;
  timeoutTurn(s, rng);
  assert.notEqual(s.turn, before);
  assert.equal(s.sub, 'roll');

  // Con un 7 y descartes pendientes: descarta, mueve el yaguareté y pasa.
  s.players[1].hand = { madera: 5, ladrillo: 5, lana: 0, trigo: 0, piedra: 0 };
  s.players[2].hand = { madera: 0, ladrillo: 0, lana: 4, trigo: 4, piedra: 1 };
  const seven = (() => { const q = [0, 0.99]; let i = 0; return () => q[i++ % 2]; })();
  const pid = s.turn;
  assert.ok(applyAction(s, pid, { type: 'roll' }, seven).ok);
  assert.equal(s.sub, 'discard');
  const jag = s.jaguar;
  timeoutTurn(s, rng);
  assert.deepEqual(s.discards, {});
  assert.notEqual(s.jaguar, jag);
  assert.equal(s.sub, 'roll');
  assert.notEqual(s.turn, pid);
  for (const p of s.players) for (const r of RES) assert.ok(p.hand[r] >= 0);

  // Partidas enteras solo a tiempo agotado terminan sin trabarse.
  for (let seed = 1; seed <= 5; seed++) {
    const g = mk(2 + (seed % 5), seed + 100);
    const r = rngFrom(seed);
    let k = 0;
    while (g.phase !== 'ended' && k++ < 3000) {
      const key = turnKey(g);
      timeoutTurn(g, r);
      assert.notEqual(turnKey(g), key, 'el turno no avanzó');
    }
  }
});

test('banco de recursos: 19 de cada uno y regla de escasez', () => {
  const rng = rngFrom(31);
  const s = mk(3, 31);
  for (const r of RES) assert.equal(s.bank[r], 19);
  doSetup(s, rng);
  for (const r of RES) assert.equal(s.bank[r] + s.players.reduce((k, p) => k + p.hand[r], 0), 19);

  // Buscar un número que le dé el mismo recurso a dos jugadores.
  const shared = [];
  for (const t of s.board.tiles) {
    if (!t.number || t.number === 7 || t.id === s.jaguar) continue;
    const owners = new Set(t.vertices.map((v) => s.buildings[v]?.p).filter((p) => p !== undefined));
    if (owners.size >= 2) shared.push(t);
  }
  const roll = (sum) => {
    const a = Math.min(6, sum - 1);
    const b = sum - a;
    const q = [(a - 1) / 6 + 0.01, (b - 1) / 6 + 0.01];
    let i = 0;
    return () => q[i++ % 2];
  };
  if (shared.length) {
    const t = shared[0];
    const res = { bosque: 'madera', colina: 'ladrillo', pradera: 'lana', campo: 'trigo', montana: 'piedra' }[t.terrain];
    // Banco casi vacío: nadie cobra.
    const extra = s.bank[res] - 1;
    s.bank[res] = 1;
    s.players[0].hand[res] += extra;
    const before = s.players.map((p) => p.hand[res]);
    s.sub = 'roll';
    assert.ok(applyAction(s, s.turn, { type: 'roll' }, roll(t.number)).ok);
    assert.deepEqual(s.players.map((p) => p.hand[res]), before);
    assert.equal(s.bank[res], 1);
  }

  // El año de abundancia y el puerto respetan el banco.
  const g = mk(2, 33);
  doSetup(g, rng);
  g.sub = 'main';
  const me = g.players[g.turn];
  me.dev = ['cosecha'];
  g.players[1 - g.turn].hand.piedra += g.bank.piedra;
  g.bank.piedra = 0;
  assert.ok(applyAction(g, g.turn, { type: 'playCard', card: 'cosecha', a: 'piedra', b: 'lana' }, rng).error);
  me.hand.madera = 4;
  g.bank.madera -= 4;
  assert.ok(applyAction(g, g.turn, { type: 'bankTrade', give: 'madera', get: 'piedra', n: 1 }, rng).error);
});

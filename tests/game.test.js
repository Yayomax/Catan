import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, applyAction, viewFor, validSettlements, validRoads, validCities,
  validJaguarTiles, stealCandidates, canAfford, bankRate, COSTS, RES, WIN_POINTS,
} from '../shared/game.js';
import { buildBoard } from '../shared/board.js';

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

test('el tablero tiene 24 terrenos, 10 puertos y sin 6/8 pegados', () => {
  for (let seed = 1; seed < 30; seed++) {
    const b = buildBoard(rngFrom(seed));
    assert.equal(b.tiles.length, 24);
    assert.equal(b.ports.length, 10);
    assert.equal(new Set(b.ports.map((p) => p.edge)).size, 10);
    assert.equal(b.tiles.filter((t) => t.number === null).length, 2);
    for (const e of b.edges) {
      if (e.tiles.length < 2) continue;
      const [x, y] = e.tiles.map((t) => b.tiles[t].number);
      assert.ok(!([6, 8].includes(x) && [6, 8].includes(y)));
    }
    for (const v of b.vertices) assert.ok(v.adj.length >= 2 && v.adj.length <= 3);
  }
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
  s.players[1].hand = { madera: 9, arcilla: 0, yerba: 0, pescado: 0, piedra: 0 };
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
  s.players[0].hand = { madera: 4, arcilla: 0, yerba: 0, pescado: 0, piedra: 0 };
  s.players[1].hand = { madera: 0, arcilla: 2, yerba: 0, pescado: 0, piedra: 0 };
  must(s, 0, { type: 'offerTrade', give: { madera: 1 }, get: { arcilla: 2 } }, rng);
  assert.ok(applyAction(s, 2, { type: 'respondTrade', accept: true }, rng).error);
  must(s, 1, { type: 'respondTrade', accept: true }, rng);
  assert.ok(applyAction(s, 0, { type: 'acceptTrade', with: 2 }, rng).error);
  must(s, 0, { type: 'acceptTrade', with: 1 }, rng);
  assert.equal(s.players[0].hand.arcilla, 2);
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
        if (me.dev.includes('baqueano') && rng() < 0.3) must(s, p, { type: 'playCard', card: 'baqueano' }, rng);
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
    }
    assert.equal(s.phase, 'ended', `seed ${seed} no terminó`);
    assert.ok(viewFor(s, 0).players[s.winner].points >= WIN_POINTS);
    assert.ok(applyAction(s, s.turn, { type: 'endTurn' }, rng).error);
  }
});

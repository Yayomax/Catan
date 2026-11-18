// Generación del tablero: isla de 19 hexágonos (hasta 4 jugadores) o 30 (5 a 6).

export const RES = ['madera', 'ladrillo', 'lana', 'trigo', 'piedra'];

export const TERRAIN_RES = {
  bosque: 'madera',
  colina: 'ladrillo',
  pradera: 'lana',
  campo: 'trigo',
  montana: 'piedra',
  desierto: null,
};

// Juego base (2 a 4 jugadores) y ampliación para 5 a 6, con las cantidades
// del juego original.
export const LAYOUTS = {
  base: {
    rows: [3, 4, 5, 4, 3],
    terrains: { bosque: 4, pradera: 4, campo: 4, colina: 3, montana: 3, desierto: 1 },
    // Fichas A–R en el orden en que se colocan en espiral.
    spiral: [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11],
    ports: ['any', 'any', 'any', 'any', 'madera', 'ladrillo', 'lana', 'trigo', 'piedra'],
  },
  grande: {
    rows: [3, 4, 5, 6, 5, 4, 3],
    terrains: { bosque: 6, pradera: 6, campo: 6, colina: 5, montana: 5, desierto: 2 },
    numbers: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12],
    ports: ['any', 'any', 'any', 'any', 'any', 'madera', 'ladrillo', 'lana', 'lana', 'trigo', 'piedra'],
  },
};

export const layoutFor = (players) => (players > 4 ? 'grande' : 'base');

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildBoard(rng = Math.random, players = 4) {
  const L = LAYOUTS[layoutFor(players)];
  const S3 = Math.sqrt(3);
  const tiles = [];
  L.rows.forEach((len, r) => {
    for (let i = 0; i < len; i++) tiles.push({ id: tiles.length, x: S3 * (i - (len - 1) / 2), z: 1.5 * r });
  });
  // Centrar la isla en el origen.
  const cx = tiles.reduce((s, t) => s + t.x, 0) / tiles.length;
  const cz = tiles.reduce((s, t) => s + t.z, 0) / tiles.length;
  for (const t of tiles) {
    t.x -= cx;
    t.z -= cz;
  }

  const vertices = [];
  const edges = [];
  const vKey = new Map();
  const eKey = new Map();
  const key = (x, z) => `${Math.round(x * 100)},${Math.round(z * 100)}`;

  for (const t of tiles) {
    t.vertices = [];
    t.edges = [];
    for (let i = 0; i < 6; i++) {
      const ang = ((60 * i - 30) * Math.PI) / 180;
      const x = t.x + Math.cos(ang);
      const z = t.z + Math.sin(ang);
      const k = key(x, z);
      if (!vKey.has(k)) {
        vKey.set(k, vertices.length);
        vertices.push({ id: vertices.length, x, z, tiles: [], adj: [], edges: [] });
      }
      const v = vKey.get(k);
      vertices[v].tiles.push(t.id);
      t.vertices.push(v);
    }
    for (let i = 0; i < 6; i++) {
      const a = t.vertices[i];
      const b = t.vertices[(i + 1) % 6];
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!eKey.has(k)) {
        eKey.set(k, edges.length);
        edges.push({ id: edges.length, a, b, tiles: [] });
        vertices[a].adj.push(b);
        vertices[b].adj.push(a);
        vertices[a].edges.push(edges.length - 1);
        vertices[b].edges.push(edges.length - 1);
      }
      const e = eKey.get(k);
      edges[e].tiles.push(t.id);
      t.edges.push(e);
    }
  }

  const neighbors = tiles.map(() => new Set());
  for (const e of edges) {
    if (e.tiles.length === 2) {
      neighbors[e.tiles[0]].add(e.tiles[1]);
      neighbors[e.tiles[1]].add(e.tiles[0]);
    }
  }

  // Terrenos al azar; fichas en espiral (base) o al azar (grande).
  // En ambos casos un 6 y un 8 nunca quedan pegados.
  const terrainPool = Object.entries(L.terrains).flatMap(([t, n]) => Array(n).fill(t));
  const hot = (n) => n === 6 || n === 8;
  const clash = () => tiles.some((t) => hot(t.number) && [...neighbors[t.id]].some((o) => hot(tiles[o].number)));
  let placed = false;
  for (let attempt = 0; attempt < 500 && !placed; attempt++) {
    shuffle(terrainPool, rng).forEach((terr, i) => (tiles[i].terrain = terr));
    if (L.spiral) {
      const corners = tiles.filter((t) => neighbors[t.id].size === 3);
      for (const corner of shuffle(corners, rng)) {
        const order = spiralOrder(tiles, neighbors, corner.id);
        let n = 0;
        for (const id of order) tiles[id].number = tiles[id].terrain === 'desierto' ? null : L.spiral[n++];
        if (!clash()) {
          placed = true;
          break;
        }
      }
    } else {
      const nums = shuffle(L.numbers, rng);
      let n = 0;
      for (const t of tiles) t.number = t.terrain === 'desierto' ? null : nums[n++];
      placed = !clash();
    }
  }

  // Puertos repartidos por la costa.
  const coast = edges
    .filter((e) => e.tiles.length === 1)
    .map((e) => {
      const mx = (vertices[e.a].x + vertices[e.b].x) / 2;
      const mz = (vertices[e.a].z + vertices[e.b].z) / 2;
      return { e, ang: Math.atan2(mz, mx) };
    })
    .sort((p, q) => p.ang - q.ang);
  const types = shuffle(L.ports, rng);
  const ports = types.map((type, i) => {
    const { e } = coast[Math.round((i * coast.length) / types.length) % coast.length];
    return { edge: e.id, a: e.a, b: e.b, type };
  });

  return { tiles, vertices, edges, ports };
}

// Recorrido en espiral hacia adentro, en sentido antihorario, desde una esquina.
export function spiralOrder(tiles, neighbors, startId) {
  const left = new Set(tiles.map((t) => t.id));
  const order = [];
  let anchor = tiles[startId];
  while (left.size) {
    const ids = [...left];
    const cx = ids.reduce((s, i) => s + tiles[i].x, 0) / ids.length;
    const cz = ids.reduce((s, i) => s + tiles[i].z, 0) / ids.length;
    const ring = ids.filter((i) => [...neighbors[i]].filter((o) => left.has(o)).length < 6);
    const ang = (i) => Math.atan2(tiles[i].z - cz, tiles[i].x - cx);
    ring.sort((a, b) => ang(b) - ang(a));
    let start = 0;
    let best = Infinity;
    ring.forEach((i, k) => {
      const d = Math.hypot(tiles[i].x - anchor.x, tiles[i].z - anchor.z);
      if (d < best - 1e-6) {
        best = d;
        start = k;
      }
    });
    const walk = [...ring.slice(start), ...ring.slice(0, start)];
    for (const i of walk) {
      order.push(i);
      left.delete(i);
    }
    anchor = tiles[walk[0]];
  }
  return order;
}

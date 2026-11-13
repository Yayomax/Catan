// Generación del tablero: una isla de 24 hexágonos (filas 4-5-6-5-4).

export const RES = ['madera', 'ladrillo', 'lana', 'trigo', 'piedra'];

export const TERRAIN_RES = {
  bosque: 'madera',
  colina: 'ladrillo',
  pradera: 'lana',
  campo: 'trigo',
  montana: 'piedra',
  desierto: null,
};

const TERRAINS = [
  ...Array(5).fill('bosque'),
  ...Array(5).fill('pradera'),
  ...Array(4).fill('campo'),
  ...Array(4).fill('colina'),
  ...Array(4).fill('montana'),
  ...Array(2).fill('desierto'),
];

const NUMBERS = [2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12];

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildBoard(rng = Math.random) {
  const S3 = Math.sqrt(3);
  const tiles = [];
  for (let r = -2; r <= 2; r++) {
    const q0 = Math.max(-2, -2 - r);
    const q1 = Math.min(2, 2 - r) + 1;
    for (let q = q0; q <= q1; q++) {
      tiles.push({ id: tiles.length, q, r, x: S3 * (q + r / 2), z: 1.5 * r });
    }
  }
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

  // Terrenos y fichas numeradas; los 6 y 8 nunca quedan pegados.
  for (let attempt = 0; attempt < 500; attempt++) {
    const terr = shuffle(TERRAINS, rng);
    const nums = shuffle(NUMBERS, rng);
    let n = 0;
    tiles.forEach((t, i) => {
      t.terrain = terr[i];
      t.number = terr[i] === 'desierto' ? null : nums[n++];
    });
    const hot = (t) => t.number === 6 || t.number === 8;
    const clash = tiles.some((t) => hot(t) && [...neighbors[t.id]].some((o) => hot(tiles[o])));
    if (!clash) break;
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
  const types = shuffle([...RES, 'any', 'any', 'any', 'any', 'any'], rng);
  const ports = types.map((type, i) => {
    const { e } = coast[Math.round((i * coast.length) / types.length) % coast.length];
    return { edge: e.id, a: e.a, b: e.b, type };
  });

  return { tiles, vertices, edges, ports };
}

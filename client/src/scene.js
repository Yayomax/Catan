// Escena 3D del tablero: isla, agua, piezas, dados y resaltado de jugadas.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { iconUrl } from './icons.js';

const H = 0.32; // altura de la cara superior de los terrenos
const TRAY = new THREE.Vector3(5.5, 0, 3.9);

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TERRAIN_STYLE = {
  bosque: { base: '#3d6b35', dark: '#2a5127', light: '#55833f' },
  pradera: { base: '#8fb552', dark: '#76a043', light: '#a9cb6a' },
  campo: { base: '#d9b748', dark: '#bf9a34', light: '#ecd070' },
  colina: { base: '#b9623e', dark: '#96482c', light: '#d08158' },
  montana: { base: '#8b9096', dark: '#6c7178', light: '#a9aeb4' },
  desierto: { base: '#dcc48c', dark: '#c4a96f', light: '#eedaa8' },
};

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function terrainTexture(type) {
  const st = TERRAIN_STYLE[type];
  const rnd = mulberry(type.length * 7919 + type.charCodeAt(0));
  return canvasTexture(512, (g, s) => {
    g.fillStyle = st.base;
    g.fillRect(0, 0, s, s);
    const blob = (x, y, r, color, alpha) => {
      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, y, r, 0, 7);
      g.fill();
    };
    for (let i = 0; i < 260; i++) blob(rnd() * s, rnd() * s, 8 + rnd() * 34, rnd() < 0.5 ? st.dark : st.light, 0.1);
    for (let i = 0; i < 5000; i++) blob(rnd() * s, rnd() * s, 0.6 + rnd() * 1.6, rnd() < 0.5 ? st.dark : st.light, 0.35);

    if (type === 'colina' || type === 'montana') {
      g.globalAlpha = 0.28;
      g.strokeStyle = st.dark;
      for (let i = 0; i < 26; i++) {
        g.lineWidth = 1 + rnd() * 3;
        g.beginPath();
        let x = rnd() * s;
        let y = rnd() * s;
        g.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += (rnd() - 0.3) * 70;
          y += (rnd() - 0.5) * (type === 'colina' ? 14 : 60);
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    if (type === 'campo') {
      g.globalAlpha = 0.2;
      g.fillStyle = '#7a5a22';
      for (let y = 14; y < s; y += 30) g.fillRect(0, y, s, 6);
    }
    if (type === 'desierto') {
      g.globalAlpha = 0.3;
      g.strokeStyle = st.dark;
      g.lineWidth = 3;
      for (let y = 10; y < s; y += 26) {
        g.beginPath();
        for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x * 0.045 + y) * 7);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  });
}

function tokenTexture(n) {
  return canvasTexture(256, (g, s) => {
    const grad = g.createRadialGradient(s * 0.4, s * 0.35, 10, s / 2, s / 2, s / 2);
    grad.addColorStop(0, '#fbf2d8');
    grad.addColorStop(1, '#e2cf9f');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2 - 2, 0, 7);
    g.fill();
    g.strokeStyle = '#8a6a3a';
    g.lineWidth = 8;
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2 - 8, 0, 7);
    g.stroke();
    const hot = n === 6 || n === 8;
    g.fillStyle = hot ? '#a8281c' : '#2c2118';
    g.font = `bold ${hot ? 138 : 122}px Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), s / 2, s / 2 - 10);
    const pips = 6 - Math.abs(7 - n);
    for (let i = 0; i < pips; i++) {
      g.beginPath();
      g.arc(s / 2 + (i - (pips - 1) / 2) * 20, s - 52, 7, 0, 7);
      g.fill();
    }
  });
}

function dieTexture(n) {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#f6f0e2';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#231a14';
    const P = [0.26, 0.5, 0.74];
    const spots = {
      1: [[1, 1]],
      2: [[0, 0], [2, 2]],
      3: [[0, 0], [1, 1], [2, 2]],
      4: [[0, 0], [2, 0], [0, 2], [2, 2]],
      5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
      6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
    }[n];
    for (const [x, y] of spots) {
      g.beginPath();
      g.arc(P[x] * s, P[y] * s, s * 0.085, 0, 7);
      g.fill();
    }
  });
}

function portTexture(type) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const paint = (img) => {
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#f1e4bd';
    g.strokeStyle = '#4a2f18';
    g.lineWidth = 12;
    g.beginPath();
    g.roundRect(14, 14, 228, 228, 44);
    g.fill();
    g.stroke();
    g.fillStyle = '#3b2414';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (type === 'any') {
      g.font = 'bold 104px Georgia, serif';
      g.fillText('3:1', 128, 134);
    } else {
      g.font = 'bold 74px Georgia, serif';
      g.fillText('2:1', 128, 74);
      if (img) g.drawImage(img, 68, 108, 120, 120);
    }
    t.needsUpdate = true;
  };
  paint(null);
  if (type !== 'any') {
    const img = new Image();
    img.onload = () => paint(img);
    img.src = iconUrl(type);
  }
  return t;
}

const WATER_VERT = `
  varying vec3 vPos;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPos = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const WATER_FRAG = `
  uniform float uTime;
  uniform vec3 uFar;
  varying vec3 vPos;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return v;
  }
  void main() {
    vec2 p = vPos.xz;
    float d = length(p * vec2(0.82, 1.0));
    float big = fbm(p * 0.22 + vec2(uTime * 0.03, uTime * 0.02));
    float fine = fbm(p * 1.5 + vec2(-uTime * 0.09, uTime * 0.06) + big * 1.5);
    vec3 shallow = vec3(0.30, 0.74, 0.70);
    vec3 mid = vec3(0.07, 0.47, 0.55);
    vec3 deep = vec3(0.02, 0.24, 0.33);
    float k = d + (big - 0.5) * 2.2;
    vec3 c = mix(shallow, mid, smoothstep(4.6, 7.2, k));
    c = mix(c, deep, smoothstep(7.0, 15.0, k));
    c += (fine - 0.5) * 0.11;
    float foam = smoothstep(0.60, 0.74, fine) * (1.0 - smoothstep(5.5, 13.0, d));
    c = mix(c, vec3(0.90, 0.97, 0.96), foam * 0.45);
    float glint = smoothstep(0.80, 0.86, fbm(p * 3.4 + uTime * 0.16));
    c += glint * 0.16;
    c = mix(c, uFar, smoothstep(20.0, 52.0, length(p)));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const FAR = new THREE.Color('#0a3443');
  const scene = new THREE.Scene();
  scene.background = FAR;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 200);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0.3, 0, 0.6);
  controls.enableDamping = true;
  controls.minDistance = 5;
  controls.maxDistance = 34;
  controls.maxPolarAngle = 1.2;
  controls.screenSpacePanning = false;

  scene.add(new THREE.HemisphereLight('#d7ecff', '#6a5535', 1.05));
  const sun = new THREE.DirectionalLight('#fff0d2', 2.9);
  sun.position.set(-7, 13, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const waterMat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    uniforms: { uTime: { value: 0 }, uFar: { value: FAR } },
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.02;
  scene.add(water);

  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const wood = std('#6b4526');
  const woodDark = std('#3f2714');
  const dummy = new THREE.Object3D();

  let boardGroup = null;
  let pieceGroup = null;
  let board = null;
  let roadMeshes = {};
  let buildingMeshes = {};
  let tokens = [];
  let jaguar = null;
  let jaguarTile = null;
  const anims = new Set();
  const playerMats = new Map();

  function instanced(geo, mat, items) {
    if (!items.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
      dummy.scale.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, it.color);
    });
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function shade(hex, rnd, spread = 0.12) {
    const c = new THREE.Color(hex);
    c.offsetHSL((rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * spread);
    return c;
  }

  function setBoard(b) {
    board = b;
    if (boardGroup) scene.remove(boardGroup);
    if (pieceGroup) scene.remove(pieceGroup);
    boardGroup = new THREE.Group();
    pieceGroup = new THREE.Group();
    scene.add(boardGroup, pieceGroup);
    roadMeshes = {};
    buildingMeshes = {};
    tokens = [];
    jaguar = null;
    jaguarTile = null;

    const rnd = mulberry(Math.round(b.tiles.reduce((s, t, i) => s + (t.number || 1) * (i + 3), 0)));
    const tileGeo = new THREE.CylinderGeometry(0.975, 0.975, H, 6);
    const beachGeo = new THREE.CylinderGeometry(1.34, 1.52, 0.34, 6);
    const sand = std('#dccb98', { roughness: 1 });
    const side = std('#6d5233', { roughness: 1 });
    const topMats = {};
    for (const type of Object.keys(TERRAIN_STYLE)) {
      topMats[type] = std('#ffffff', { map: terrainTexture(type), roughness: 0.95 });
    }
    const tokenGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 40);
    const tokenFaceGeo = new THREE.CircleGeometry(0.3, 40).rotateX(-Math.PI / 2);
    const tokenSide = std('#cdb787');

    const deco = { trunk: [], cone: [], round: [], bush: [], rock: [], mound: [], brick: [], reed: [], pad: [] };
    const spot = (t, min = 0.4, max = 0.8) => {
      const a = rnd() * Math.PI * 2;
      const d = min + rnd() * (max - min);
      return { x: t.x + Math.cos(a) * d * 0.94, z: t.z + Math.sin(a) * d * 0.94 };
    };

    for (const t of b.tiles) {
      const beach = new THREE.Mesh(beachGeo, sand);
      beach.position.set(t.x, -0.09, t.z);
      beach.receiveShadow = true;
      const tile = new THREE.Mesh(tileGeo, [side, topMats[t.terrain], side]);
      tile.position.set(t.x, H / 2, t.z);
      tile.rotation.y = Math.floor(rnd() * 6) * (Math.PI / 3);
      tile.castShadow = true;
      tile.receiveShadow = true;
      boardGroup.add(beach, tile);

      if (t.number) {
        const tok = new THREE.Group();
        const disc = new THREE.Mesh(tokenGeo, tokenSide);
        disc.position.y = 0.025;
        disc.castShadow = true;
        const face = new THREE.Mesh(tokenFaceGeo, std('#ffffff', { map: tokenTexture(t.number), roughness: 0.7 }));
        face.position.y = 0.052;
        face.receiveShadow = true;
        tok.add(disc, face);
        tok.position.set(t.x, H, t.z);
        tok.userData.number = t.number;
        boardGroup.add(tok);
        tokens.push(tok);
      }

      if (t.terrain === 'bosque') {
        for (let i = 0; i < 24; i++) {
          const p = spot(t, 0.56, 0.84);
          const s = 0.6 + rnd() * 0.5;
          deco.trunk.push({ ...p, y: H, s, color: shade('#5a3c22', rnd) });
          const leaf = shade(rnd() < 0.5 ? '#2f6a2c' : '#3f8136', rnd, 0.16);
          if (rnd() < 0.55) {
            deco.cone.push({ ...p, y: H + 0.09 * s, s, ry: rnd() * 6, color: leaf });
            deco.cone.push({ ...p, y: H + 0.24 * s, s: s * 0.7, ry: rnd() * 6, color: leaf });
          } else {
            deco.round.push({ ...p, y: H + 0.25 * s, s, sy: s * (0.8 + rnd() * 0.4), ry: rnd() * 6, color: leaf });
          }
        }
      } else if (t.terrain === 'pradera') {
        // Ovejas pastando y matas de pasto.
        for (let i = 0; i < 7; i++) {
          const p = spot(t, 0.46, 0.76);
          const ry = rnd() * Math.PI * 2;
          const hx = Math.cos(ry) * 0.085;
          const hz = -Math.sin(ry) * 0.085;
          deco.bush.push({ ...p, y: H + 0.075, sx: 1.25, sy: 0.85, sz: 0.85, ry, color: shade('#f1ede2', rnd, 0.05) });
          deco.bush.push({ x: p.x + hx, z: p.z + hz, y: H + 0.095, s: 0.42, color: new THREE.Color('#2e2a26') });
          for (const k of [-0.045, 0.045]) deco.trunk.push({ x: p.x + Math.cos(ry) * k, z: p.z - Math.sin(ry) * k, y: H, s: 0.32, sx: 0.5, sz: 0.5, color: new THREE.Color('#2e2a26') });
        }
        for (let i = 0; i < 40; i++) {
          const p = spot(t, 0.4, 0.84);
          deco.reed.push({ ...p, y: H, s: 0.35 + rnd() * 0.3, sx: 2, sz: 2, color: shade('#5f9a35', rnd, 0.16) });
        }
      } else if (t.terrain === 'colina') {
        for (let i = 0; i < 9; i++) {
          const p = spot(t, 0.45, 0.76);
          deco.mound.push({ ...p, y: H, s: 0.7 + rnd() * 0.9, sy: 0.35 + rnd() * 0.35, ry: rnd() * 6, color: shade('#b3552f', rnd, 0.14) });
        }
        for (let i = 0; i < 3; i++) {
          const p = spot(t, 0.5, 0.7);
          const ry = rnd() * 3;
          for (let k = 0; k < 3; k++) deco.brick.push({ ...p, y: H + 0.03 + k * 0.058, ry: ry + (k % 2) * 0.12, color: shade('#c9673f', rnd, 0.1) });
        }
      } else if (t.terrain === 'montana') {
        for (let i = 0; i < 15; i++) {
          const p = spot(t, 0.42, 0.78);
          const s = 0.5 + rnd() * 1.25;
          deco.rock.push({ ...p, y: H + 0.05 * s, s, sy: s * (0.6 + rnd() * 0.5), ry: rnd() * 6, rx: rnd() * 0.5, color: shade('#8f959c', rnd, 0.2) });
        }
      } else if (t.terrain === 'campo') {
        // Hileras de trigo.
        for (let gx = -8; gx <= 8; gx++) {
          for (let gz = -5; gz <= 5; gz++) {
            const dx = gx * 0.095 + (rnd() - 0.5) * 0.03;
            const dz = gz * 0.15 + (rnd() - 0.5) * 0.02;
            const d = Math.hypot(dx, dz);
            if (d < 0.4 || d > 0.8) continue;
            deco.reed.push({ x: t.x + dx, z: t.z + dz, y: H, s: 0.55 + rnd() * 0.25, sx: 2.6, sz: 2.6, rz: (rnd() - 0.5) * 0.25, color: shade('#e2bd45', rnd, 0.16) });
          }
        }
      } else {
        // Desierto: médanos, piedras sueltas y algún cactus.
        for (let i = 0; i < 6; i++) {
          const p = spot(t, 0.2, 0.7);
          deco.mound.push({ ...p, y: H - 0.01, s: 1 + rnd() * 1.2, sy: 0.16 + rnd() * 0.14, ry: rnd() * 6, color: shade('#e3cd97', rnd, 0.08) });
        }
        for (let i = 0; i < 5; i++) {
          const p = spot(t, 0.3, 0.8);
          const s = 0.3 + rnd() * 0.4;
          deco.rock.push({ ...p, y: H + 0.03 * s, s, ry: rnd() * 6, color: shade('#b39a6c', rnd, 0.14) });
        }
        for (let i = 0; i < 3; i++) {
          const p = spot(t, 0.5, 0.78);
          const s = 0.9 + rnd() * 0.6;
          deco.trunk.push({ ...p, y: H, s, sx: 1.5, sz: 1.5, color: shade('#4f8a4a', rnd, 0.1) });
          deco.trunk.push({ x: p.x + 0.045, z: p.z, y: H + 0.07 * s, s: s * 0.45, sx: 1.1, sz: 1.1, rz: -0.9, color: shade('#4f8a4a', rnd, 0.1) });
        }
      }
    }

    const white = std('#ffffff', { roughness: 0.9 });
    const flat = std('#ffffff', { roughness: 1, flatShading: true });
    const add = (m) => m && boardGroup.add(m);
    add(instanced(new THREE.CylinderGeometry(0.022, 0.034, 0.2, 5).translate(0, 0.1, 0), white, deco.trunk));
    add(instanced(new THREE.ConeGeometry(0.13, 0.3, 7).translate(0, 0.15, 0), flat, deco.cone));
    add(instanced(new THREE.IcosahedronGeometry(0.14, 1), flat, deco.round));
    add(instanced(new THREE.SphereGeometry(0.075, 7, 5), flat, deco.bush));
    add(instanced(new THREE.DodecahedronGeometry(0.11, 0), flat, deco.rock));
    add(instanced(new THREE.IcosahedronGeometry(0.16, 1), flat, deco.mound));
    add(instanced(new THREE.BoxGeometry(0.15, 0.055, 0.08), white, deco.brick));
    add(instanced(new THREE.ConeGeometry(0.012, 0.26, 4).translate(0, 0.13, 0), white, deco.reed));
    add(instanced(new THREE.CylinderGeometry(0.05, 0.05, 0.006, 10), white, deco.pad));

    // Puertos: dos pasarelas desde las esquinas hasta un cartel.
    for (const port of b.ports) {
      const va = b.vertices[port.a];
      const vb = b.vertices[port.b];
      const tile = b.tiles[b.edges[port.edge].tiles[0]];
      const mx = (va.x + vb.x) / 2;
      const mz = (va.z + vb.z) / 2;
      const out = new THREE.Vector2(mx - tile.x, mz - tile.z).normalize();
      const px = mx + out.x * 0.78;
      const pz = mz + out.y * 0.78;
      for (const v of [va, vb]) {
        const len = Math.hypot(px - v.x, pz - v.z);
        const plank = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.13), wood);
        plank.position.set((px + v.x) / 2, 0.13, (pz + v.z) / 2);
        plank.rotation.y = -Math.atan2(pz - v.z, px - v.x);
        plank.castShadow = plank.receiveShadow = true;
        boardGroup.add(plank);
      }
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 8), wood);
      deck.position.set(px, 0.135, pz);
      deck.castShadow = deck.receiveShadow = true;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 6), woodDark);
      post.position.set(px, 0.38, pz);
      post.castShadow = true;
      const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: portTexture(port.type) }));
      sign.position.set(px, 0.86, pz);
      sign.scale.setScalar(0.62);
      boardGroup.add(deck, post, sign);
    }

    fitCamera(true);
  }

  // ---------- Piezas ----------

  function mats(color) {
    if (!playerMats.has(color)) {
      const c = new THREE.Color(color);
      playerMats.set(color, {
        body: new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }),
        roof: new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.5), roughness: 0.6 }),
      });
    }
    return playerMats.get(color);
  }

  const part = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    return m;
  };

  function makeBuilding(type, color) {
    const { body, roof } = mats(color);
    const g = new THREE.Group();
    if (type === 'settlement') {
      g.add(part(new THREE.BoxGeometry(0.21, 0.14, 0.21), body, 0, 0.07, 0));
      g.add(part(new THREE.ConeGeometry(0.19, 0.13, 4).rotateY(Math.PI / 4), roof, 0, 0.205, 0));
    } else {
      g.add(part(new THREE.BoxGeometry(0.34, 0.16, 0.24), body, 0, 0.08, 0));
      g.add(part(new THREE.ConeGeometry(0.2, 0.12, 4).rotateY(Math.PI / 4).scale(1.25, 1, 0.9), roof, -0.03, 0.22, 0));
      g.add(part(new THREE.BoxGeometry(0.13, 0.34, 0.13), body, 0.12, 0.17, 0.03));
      g.add(part(new THREE.ConeGeometry(0.12, 0.13, 4).rotateY(Math.PI / 4), roof, 0.12, 0.405, 0.03));
    }
    g.scale.setScalar(1.45);
    return g;
  }

  function drop(obj) {
    obj.userData.baseY = obj.position.y;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 520);
      const e = 1 - Math.pow(1 - k, 3);
      const bounce = k < 1 ? Math.abs(Math.sin(k * Math.PI * 2.5)) * (1 - k) * 0.35 : 0;
      obj.position.y = obj.userData.baseY + (1 - e) * 1.6 + bounce;
      obj.scale.setScalar((obj.userData.size || 1) * (0.4 + 0.6 * e));
      return k < 1;
    };
    step(t0);
    anims.add(step);
  }

  function buildJaguar() {
    const fur = std('#d7952a', { roughness: 0.6 });
    const dark = std('#2a1c10');
    const g = new THREE.Group();
    g.add(part(new THREE.CapsuleGeometry(0.075, 0.2, 4, 10).rotateZ(Math.PI / 2), fur, 0, 0.19, 0));
    g.add(part(new THREE.SphereGeometry(0.08, 12, 10), fur, 0.2, 0.25, 0));
    g.add(part(new THREE.SphereGeometry(0.04, 8, 8), fur, 0.27, 0.23, 0));
    g.add(part(new THREE.SphereGeometry(0.016, 6, 6), dark, 0.305, 0.235, 0));
    for (const z of [-0.045, 0.045]) {
      g.add(part(new THREE.ConeGeometry(0.025, 0.045, 5), fur, 0.19, 0.335, z));
      g.add(part(new THREE.SphereGeometry(0.012, 6, 6), dark, 0.262, 0.275, z * 0.75));
      for (const x of [-0.12, 0.12]) g.add(part(new THREE.CylinderGeometry(0.026, 0.022, 0.15, 6), fur, x, 0.075, z));
    }
    const tail = part(new THREE.CylinderGeometry(0.014, 0.02, 0.24, 5), fur, -0.25, 0.25, 0);
    tail.rotation.z = -0.9;
    g.add(tail);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      g.add(part(new THREE.SphereGeometry(0.017, 5, 5), dark, -0.13 + (i % 5) * 0.065, 0.19 + Math.sin(a) * 0.066, Math.cos(a) * 0.066));
    }
    g.scale.setScalar(1.6);
    return g;
  }

  const jaguarPos = (tileId) => {
    const t = board.tiles[tileId];
    return new THREE.Vector3(t.x, H + 0.06, t.z);
  };

  function sync(s) {
    if (!board) return;
    for (const [e, p] of Object.entries(s.roads)) {
      if (roadMeshes[e]) continue;
      const E = board.edges[e];
      const a = board.vertices[E.a];
      const b = board.vertices[E.b];
      const m = part(new RoundedBoxGeometry(0.58, 0.1, 0.15, 2, 0.03), mats(s.players[p].color).body, (a.x + b.x) / 2, H + 0.05, (a.z + b.z) / 2);
      m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      pieceGroup.add(m);
      roadMeshes[e] = m;
      drop(m);
    }
    for (const [v, b] of Object.entries(s.buildings)) {
      const cur = buildingMeshes[v];
      if (cur && cur.userData.type === b.type) continue;
      if (cur) pieceGroup.remove(cur);
      const V = board.vertices[v];
      const g = makeBuilding(b.type, s.players[b.p].color);
      g.position.set(V.x, H, V.z);
      g.rotation.y = ((Number(v) * 37) % 7) * 0.3;
      g.userData.type = b.type;
      g.userData.size = 1.45;
      pieceGroup.add(g);
      buildingMeshes[v] = g;
      drop(g);
    }
    if (!jaguar) {
      jaguar = buildJaguar();
      jaguar.position.copy(jaguarPos(s.jaguar));
      pieceGroup.add(jaguar);
      jaguarTile = s.jaguar;
    } else if (jaguarTile !== s.jaguar) {
      jaguarTile = s.jaguar;
      const from = jaguar.position.clone();
      const to = jaguarPos(s.jaguar);
      jaguar.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x);
      const t0 = performance.now();
      anims.add((now) => {
        const k = Math.min(1, (now - t0) / 700);
        const e = k * k * (3 - 2 * k);
        jaguar.position.lerpVectors(from, to, e);
        jaguar.position.y += Math.sin(k * Math.PI) * 0.9;
        return k < 1;
      });
    }
  }

  // ---------- Dados ----------

  const tray = new THREE.Group();
  tray.add(part(new THREE.BoxGeometry(1.9, 0.1, 1.15), wood, 0, 0.1, 0));
  tray.add(part(new THREE.BoxGeometry(1.74, 0.02, 1.0), std('#2f5a3c', { roughness: 1 }), 0, 0.155, 0));
  for (const [w, d, x, z] of [[2.0, 0.1, 0, 0.6], [2.0, 0.1, 0, -0.6], [0.1, 1.3, 0.98, 0], [0.1, 1.3, -0.98, 0]]) {
    tray.add(part(new THREE.BoxGeometry(w, 0.24, d), woodDark, x, 0.14, z));
  }
  tray.position.copy(TRAY);
  tray.rotation.y = -0.22;
  scene.add(tray);

  const FACES = [3, 4, 1, 6, 2, 5]; // +x -x +y -y +z -z
  const dieMats = FACES.map((n) => new THREE.MeshStandardMaterial({ map: dieTexture(n), roughness: 0.35 }));
  const UP = {
    1: [0, 0, 0],
    6: [Math.PI, 0, 0],
    2: [-Math.PI / 2, 0, 0],
    5: [Math.PI / 2, 0, 0],
    3: [0, 0, Math.PI / 2],
    4: [0, 0, -Math.PI / 2],
  };
  const dice = [-0.4, 0.4].map((x, i) => {
    const d = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.44, 0.44, 4, 0.07), dieMats);
    d.castShadow = true;
    d.position.set(x, 0.385, i ? 0.08 : -0.1);
    d.rotation.set(...UP[i ? 5 : 3]);
    tray.add(d);
    return d;
  });

  function rollDice(values) {
    const t0 = performance.now();
    dice.forEach((d, i) => {
      const restX = i ? 0.4 : -0.4;
      const restZ = i ? 0.08 : -0.1;
      const spin = [8 + Math.random() * 6, 5 + Math.random() * 5, 7 + Math.random() * 6].map((v) => v * (Math.random() < 0.5 ? -1 : 1));
      const yaw = (Math.random() - 0.5) * 0.9;
      const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...UP[values[i]])));
      const tumble = new THREE.Quaternion();
      anims.add((now) => {
        const k = Math.min(1, (now - t0) / (1000 + i * 140));
        const r = Math.pow(1 - k, 2);
        tumble.setFromEuler(new THREE.Euler(spin[0] * r, spin[1] * r, spin[2] * r));
        d.quaternion.copy(tumble).multiply(target);
        d.position.set(restX - r * 1.2, 0.385 + Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k) * 1.5, restZ + r * 0.5);
        return k < 1;
      });
    });
    const sum = values[0] + values[1];
    setTimeout(() => {
      for (const tok of tokens) {
        if (tok.userData.number !== sum) continue;
        const t1 = performance.now();
        anims.add((now) => {
          const k = Math.min(1, (now - t1) / 900);
          tok.position.y = H + Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k) * 0.5;
          tok.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.35);
          return k < 1;
        });
      }
    }, 1100);
  }

  // ---------- Resaltado y selección ----------

  const hlGroup = new THREE.Group();
  scene.add(hlGroup);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#fff0a8', transparent: true, opacity: 0.92, depthTest: false });
  const glowHover = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 1, depthTest: false });
  const HL = {
    vertex: { hit: new THREE.SphereGeometry(0.3, 8, 6), glyph: new THREE.SphereGeometry(0.115, 16, 12) },
    edge: { hit: new THREE.BoxGeometry(0.62, 0.3, 0.34), glyph: new RoundedBoxGeometry(0.5, 0.06, 0.1, 2, 0.02) },
    tile: { hit: new THREE.CylinderGeometry(0.7, 0.7, 0.3, 12), glyph: new THREE.TorusGeometry(0.43, 0.04, 8, 40).rotateX(Math.PI / 2) },
  };
  let hits = [];
  let onPick = null;
  let hovered = null;

  function setHighlights(kind, ids, cb) {
    hlGroup.clear();
    hits = [];
    hovered = null;
    onPick = cb || null;
    canvas.style.cursor = '';
    if (!board || !kind) return;
    for (const id of ids) {
      const hit = new THREE.Mesh(HL[kind].hit, hitMat);
      const glyph = new THREE.Mesh(HL[kind].glyph, glowMat);
      glyph.renderOrder = 10;
      hit.add(glyph);
      if (kind === 'vertex') {
        const v = board.vertices[id];
        hit.position.set(v.x, H + 0.12, v.z);
      } else if (kind === 'edge') {
        const E = board.edges[id];
        const a = board.vertices[E.a];
        const b = board.vertices[E.b];
        hit.position.set((a.x + b.x) / 2, H + 0.06, (a.z + b.z) / 2);
        hit.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      } else {
        const t = board.tiles[id];
        hit.position.set(t.x, H + 0.1, t.z);
      }
      hit.userData.id = id;
      hlGroup.add(hit);
      hits.push(hit);
    }
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitAt = (ev) => {
    if (!hits.length) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const found = ray.intersectObjects(hits, false);
    if (!found.length) return null;
    // Entre los alcanzados, el más cercano al rayo (mejor para dedos).
    let best = null;
    let bestD = Infinity;
    for (const f of found) {
      const d = ray.ray.distanceSqToPoint(f.object.position);
      if (d < bestD) {
        bestD = d;
        best = f.object;
      }
    }
    return best;
  };

  let down = null;
  canvas.addEventListener('pointerdown', (ev) => (down = { x: ev.clientX, y: ev.clientY }));
  canvas.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 8) return;
    const h = hitAt(ev);
    if (h && onPick) onPick(h.userData.id);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'touch') return;
    const h = hitAt(ev);
    if (h === hovered) return;
    if (hovered) hovered.children[0].material = glowMat;
    hovered = h;
    if (h) h.children[0].material = glowHover;
    canvas.style.cursor = h ? 'pointer' : '';
  });

  // ---------- Cámara y bucle ----------

  let lastAspect = 0;
  function fitCamera(force) {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!force && Math.abs(camera.aspect - lastAspect) < 0.25) return;
    lastAspect = camera.aspect;
    const half = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(17.5, 6.7 / (half * camera.aspect));
    const dir = new THREE.Vector3(0, 1, 0.72).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, dist);
    controls.update();
  }
  window.addEventListener('resize', () => fitCamera(false));
  fitCamera(true);

  const clock = new THREE.Clock();
  function frame() {
    const now = performance.now();
    const t = clock.getElapsedTime();
    waterMat.uniforms.uTime.value = t;
    for (const fn of anims) if (!fn(now)) anims.delete(fn);
    const pulse = 1 + Math.sin(t * 5) * 0.14;
    for (const h of hits) h.children[0].scale.setScalar(h === hovered ? 1.35 : pulse);
    tray.position.y = Math.sin(t * 0.9) * 0.012;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Posiciones en pantalla de las jugadas resaltadas (para pruebas automáticas).
  function highlightPoints() {
    const r = canvas.getBoundingClientRect();
    return hits.map((h) => {
      const p = h.position.clone().project(camera);
      return { id: h.userData.id, x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    });
  }

  return { setBoard, sync, setHighlights, rollDice, highlightPoints };
}

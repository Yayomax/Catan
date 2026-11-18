// Sonidos sintetizados con Web Audio: no hay archivos de audio que cargar.

let ctx = null;
let master = null;
let settings = { sound: true, volume: 0.7 };

export function setSoundSettings(s) {
  settings = { ...settings, ...s };
  if (master) master.gain.value = settings.volume;
}

// El navegador solo deja sonar después de un toque o clic del usuario.
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = settings.volume;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq, { type = 'sine', at = 0, dur = 0.2, vol = 0.3, attack = 0.005, slide = 0, filter = 0 } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o.connect(g);
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    node = g.connect(f);
    f.connect(master);
  } else g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ at = 0, dur = 0.08, vol = 0.3, freq = 2000, q = 1, type = 'bandpass' } = {}) {
  const t = ctx.currentTime + at;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const SOUNDS = {
  // Dados rodando sobre la bandeja de madera.
  dice() {
    for (let i = 0; i < 9; i++) {
      const at = i * 0.07 + Math.random() * 0.03;
      noise({ at, dur: 0.05, vol: 0.5 - i * 0.04, freq: 1800 + Math.random() * 1500, q: 3 });
      tone(320 + Math.random() * 200, { type: 'triangle', at, dur: 0.05, vol: 0.12 });
    }
    noise({ at: 0.75, dur: 0.07, vol: 0.4, freq: 1400, q: 2 });
  },
  // Golpe de madera al apoyar una pieza.
  build() {
    tone(180, { type: 'triangle', dur: 0.18, vol: 0.5, slide: 0.6 });
    noise({ dur: 0.06, vol: 0.35, freq: 900, q: 1.5 });
    tone(360, { type: 'sine', at: 0.05, dur: 0.12, vol: 0.12 });
  },
  city() {
    SOUNDS.build();
    [523, 659, 784].forEach((f, i) => tone(f, { type: 'triangle', at: 0.12 + i * 0.07, dur: 0.25, vol: 0.12 }));
  },
  // Es tu turno: campanita de dos notas.
  yourTurn() {
    tone(784, { type: 'sine', dur: 0.35, vol: 0.25 });
    tone(1175, { type: 'sine', at: 0.12, dur: 0.5, vol: 0.22 });
    tone(1568, { type: 'sine', at: 0.12, dur: 0.4, vol: 0.05 });
  },
  turn() {
    tone(523, { type: 'sine', dur: 0.18, vol: 0.12 });
  },
  // Aparece el ladrón: grave y amenazante.
  robber() {
    tone(110, { type: 'sawtooth', dur: 0.7, vol: 0.18, slide: 0.7, filter: 600 });
    tone(116, { type: 'sawtooth', dur: 0.7, vol: 0.12, slide: 0.7, filter: 500 });
    noise({ dur: 0.4, vol: 0.12, freq: 300, q: 0.7, type: 'lowpass' });
  },
  // Carta que llega a la mano.
  card() {
    noise({ dur: 0.05, vol: 0.18, freq: 4500, q: 0.8 });
    tone(880, { type: 'sine', at: 0.02, dur: 0.08, vol: 0.06 });
  },
  // Trueque o cambio cerrado: monedas.
  trade() {
    [1318, 1568, 2093].forEach((f, i) => tone(f, { type: 'triangle', at: i * 0.06, dur: 0.18, vol: 0.12 }));
  },
  devCard() {
    noise({ dur: 0.12, vol: 0.2, freq: 3000, q: 0.6 });
    tone(660, { type: 'triangle', at: 0.05, dur: 0.25, vol: 0.15, slide: 1.5 });
  },
  award() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, { type: 'triangle', at: i * 0.09, dur: 0.3, vol: 0.15 }));
  },
  alert() {
    tone(660, { type: 'square', dur: 0.12, vol: 0.08, filter: 2000 });
    tone(523, { type: 'square', at: 0.14, dur: 0.18, vol: 0.08, filter: 2000 });
  },
  chat() {
    tone(1046, { type: 'sine', dur: 0.08, vol: 0.12 });
    tone(1397, { type: 'sine', at: 0.06, dur: 0.1, vol: 0.1 });
  },
  // Tic del reloj; "urgent" para los últimos segundos.
  tick(urgent) {
    noise({ dur: 0.025, vol: urgent ? 0.5 : 0.3, freq: urgent ? 3200 : 2400, q: 4 });
    tone(urgent ? 1760 : 1320, { type: 'square', dur: 0.03, vol: urgent ? 0.06 : 0.035, filter: 4000 });
  },
  win() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, { type: 'triangle', at: i * 0.12, dur: 0.35, vol: 0.16 }));
  },
  lose() {
    [392, 349, 311, 262].forEach((f, i) => tone(f, { type: 'triangle', at: i * 0.18, dur: 0.4, vol: 0.13 }));
  },
  pause() {
    tone(440, { type: 'sine', dur: 0.15, vol: 0.15 });
    tone(330, { type: 'sine', at: 0.12, dur: 0.25, vol: 0.15 });
  },
  click() {
    tone(1200, { type: 'sine', dur: 0.03, vol: 0.05 });
  },
};

export function play(name, arg) {
  if (!settings.sound || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
  try {
    SOUNDS[name](arg);
  } catch {
    // Un sonido que falla nunca debe romper el juego.
  }
}

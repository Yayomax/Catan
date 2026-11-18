import { createScene } from './scene.js';
import {
  RES, COSTS, WIN_POINTS, canAfford, validSettlements, validRoads, validCities,
  validJaguarTiles, stealCandidates, bankRate, piecesLeft, bankCredits,
} from '../../shared/game.js';
import { ICONS, RES_INFO, CARD_INFO, UI, DEV_ART, PIECE_ICON } from './icons.js';
import { play, unlockAudio, setSoundSettings } from './sounds.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const zero = () => Object.fromEntries(RES.map((r) => [r, 0]));
const sum = (b) => RES.reduce((n, r) => n + (b[r] || 0), 0);

const scene = createScene($('board'));
if (new URLSearchParams(location.search).has('debug')) {
  // Solo para pruebas automáticas.
  window.__scene = scene;
  window.__debug = { state: () => S, you: () => you, render: () => render() };
}

let ws = null;
let you = null;
let lobby = null;
let S = null; // estado de la partida
let board = null;
let online = [];
let mode = null; // 'road' | 'settlement' | 'city'
let modal = null; // { kind, ...datos }
let lastRoll = 0;
let logOpen = false;
let menuOpen = false;
let paused = null; // { by, name } si la partida está en pausa
const prefs = { sound: true, volume: 0.7, ticks: true, anim: true, ...JSON.parse(localStorage.getItem('litoral.prefs') || '{}') };
setSoundSettings(prefs);
const savePrefs = () => {
  localStorage.setItem('litoral.prefs', JSON.stringify(prefs));
  setSoundSettings(prefs);
};
let sideTab = 'log'; // 'log' | 'chat'
let chat = [];
let unread = 0;
let tradeDraft = null; // { give, get } mientras armás un intercambio
let confirmBuild = null; // { kind, id } jugada sugerida esperando confirmación
const incoming = { madera: 0, ladrillo: 0, lana: 0, trigo: 0, piedra: 0 }; // cartas en vuelo hacia tu mano
let notice = '';
let bankOpen = false;
let lastFlowSeq = null;
let pendingFlows = null;
let connected = false;
let timer = null; // { deadline, total } en hora del servidor
let clockOffset = 0; // hora del servidor - hora local
const TURN_OPTIONS = [0, 30, 60, 90, 120, 180];
const fmtSecs = (n) => (n ? (n < 60 ? `${n} s` : n % 60 ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')} min` : `${n / 60} min`) : 'Sin límite');

const session = {
  get: () => JSON.parse(localStorage.getItem('litoral.session') || 'null'),
  set: (v) => localStorage.setItem('litoral.session', JSON.stringify(v)),
  clear: () => localStorage.removeItem('litoral.session'),
};

// ---------- Red ----------

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    connected = true;
    const s = session.get();
    if (s) send({ t: 'rejoin', code: s.code, token: s.token });
    render();
  };
  ws.onclose = () => {
    connected = false;
    render();
    setTimeout(connect, 1500);
  };
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
}

const send = (m) => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));
const act = (a) => send({ t: 'act', a });

function onMessage(m) {
  if (m.t === 'joined') {
    session.set({ code: m.code, token: m.token });
    history.replaceState(null, '', `?sala=${m.code}`);
  } else if (m.t === 'lobby') {
    lobby = m;
    you = m.you;
    S = null;
  } else if (m.t === 'state') {
    const fresh = !!m.s.board;
    if (fresh) {
      board = m.s.board;
      scene.setBoard(board);
      lastRoll = m.s.rollId;
      lastFlowSeq = m.s.flowSeq;
      tradeDraft = null;
      confirmBuild = null;
      for (const r of RES) incoming[r] = 0;
      modal = null;
      mode = null;
    }
    lobby = { code: m.code };
    you = m.you;
    online = m.online;
    timer = m.timer;
    clockOffset = m.now - Date.now();
    const prev = fresh ? null : S;
    const wasPaused = paused;
    paused = m.paused;
    S = { ...m.s, board };
    if (prev) soundsFor(prev, S);
    if (!!wasPaused !== !!paused && !fresh) play('pause');
    scene.sync(S);
    let rolled = false;
    if (S.rollId !== lastRoll) {
      lastRoll = S.rollId;
      scene.rollDice(S.dice);
      rolled = true;
    }
    if (S.flowSeq !== lastFlowSeq) {
      lastFlowSeq = S.flowSeq;
      // Lo que cobra una tirada vuela cuando los dados terminan de rodar.
      if (S.flows.length) {
        // Las cartas que vienen a tu mano suman recién cuando llegan.
        for (const f of S.flows) if (f.to === you && f.res) incoming[f.res] += f.n;
        pendingFlows = { flows: S.flows, delay: rolled ? 1050 : 0 };
      }
    }
    if (!canUseMode()) mode = null;
    if (!inMain()) {
      tradeDraft = null;
      confirmBuild = null;
    }
    if (confirmBuild && !suggestionStillValid(confirmBuild)) confirmBuild = null;
  } else if (m.t === 'error') {
    if (m.msg === 'No existe esa sala.') {
      notice = 'Esa sala no existe. Puede que el servidor se haya reiniciado: pedile a quien la creó un link nuevo.';
      $('screen').innerHTML = '';
    }
    toast(m.msg);
  } else if (m.t === 'chatlog') {
    chat = m.list || [];
  } else if (m.t === 'chat') {
    chat.push(m.m);
    if (chat.length > 60) chat.shift();
    const visibleChat = sideTab === 'chat' && (logOpen || !window.matchMedia('(max-width: 860px)').matches);
    if (!visibleChat && m.m.from !== you) {
      unread++;
      toastChat(m.m);
    }
    if (m.m.from !== you) play('chat');
  } else if (m.t === 'hello') {
    // Hay una versión nueva del juego: recargar para no quedar con la vieja.
    const seen = sessionStorage.getItem('litoral.build');
    if (seen && seen !== m.build && m.build !== 'dev') {
      sessionStorage.setItem('litoral.build', m.build);
      location.reload();
      return;
    }
    sessionStorage.setItem('litoral.build', m.build);
  } else if (m.t === 'gone') {
    const wasPlaying = !!(S || lobby || session.get());
    session.clear();
    lobby = null;
    S = null;
    history.replaceState(null, '', location.pathname);
    $('screen').innerHTML = '';
    notice = wasPlaying
      ? 'La sala se cerró porque el servidor se reinició (por ejemplo, por una actualización). Creá una sala nueva y volvé a pasar el link.'
      : '';
  }
  render();
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- Sonidos según lo que cambió ----------

function soundsFor(a, b) {
  if (b.phase === 'ended' && a.phase !== 'ended') return play(b.winner === you ? 'win' : 'lose');
  if (b.rollId !== a.rollId) {
    play('dice');
    if (b.dice && b.dice[0] + b.dice[1] === 7) setTimeout(() => play('robber'), 1000);
  } else if (b.jaguar !== a.jaguar) play('robber');
  const nb = (x) => Object.keys(x.buildings).length;
  const cities = (x) => Object.values(x.buildings).filter((v) => v.type === 'city').length;
  if (cities(b) > cities(a)) play('city');
  else if (nb(b) > nb(a) || Object.keys(b.roads).length > Object.keys(a.roads).length) play('build');
  if ((b.longest !== a.longest && b.longest !== null) || (b.largest !== a.largest && b.largest !== null)) setTimeout(() => play('award'), 250);
  const mine = (x) => x.players[you];
  if (mine(b).devCount > mine(a).devCount || (b.playedCard && !a.playedCard)) play('devCard');
  const traded = b.flows.some((f) => (f.from === 'bank' && f.to === you && b.flows.some((g) => g.to === 'bank' && g.from === you)) || (f.from !== 'bank' && f.to !== 'bank' && !f.secret));
  if (traded && b.rollId === a.rollId) play('trade');
  if (b.discards[you] && !a.discards[you]) setTimeout(() => play('alert'), 900);
  const turnChanged = b.turn !== a.turn || (b.phase === 'play' && a.phase === 'setup');
  if (turnChanged) setTimeout(() => play(b.turn === you ? 'yourTurn' : 'turn'), 150);
}

// ---------- Ayudas de estado ----------

const me = () => S.players[you];
const myTurn = () => S && S.turn === you && S.phase !== 'ended';
const inMain = () => myTurn() && S.phase === 'play' && S.sub === 'main' && !S.freeRoads;

function canBuild(kind) {
  if (!inMain()) return false;
  const left = piecesLeft(S, you);
  if (kind === 'road') return left.road > 0 && canAfford(me().hand, COSTS.road) && validRoads(S, you).length > 0;
  if (kind === 'settlement') return left.settlement > 0 && canAfford(me().hand, COSTS.settlement) && validSettlements(S, you).length > 0;
  return left.city > 0 && canAfford(me().hand, COSTS.city) && validCities(S, you).length > 0;
}
const canUseMode = () => mode && canBuild(mode);

function statusText() {
  const name = esc(S.players[S.turn].name);
  if (S.phase === 'ended') return `Ganó ${esc(S.players[S.winner].name)}`;
  if (S.discards[you]) return `Salió 7: descartá ${S.discards[you]} cartas`;
  if (S.phase === 'setup') {
    if (!myTurn()) return `${name} está eligiendo dónde construir`;
    return S.sub === 'settlement' ? 'Tocá una esquina para construir tu pueblo' : 'Ahora tocá un borde para tu carretera';
  }
  if (S.sub === 'discard') return 'Salió 7: esperando los descartes';
  if (!myTurn()) return S.sub === 'roll' ? `Turno de ${name}: tirando los dados` : `Turno de ${name} · salió ${S.dice[0] + S.dice[1]}`;
  if (S.sub === 'roll') return 'Tu turno: tirá los dados';
  if (S.sub === 'jaguar') return 'Tocá un terreno para mover el ladrón';
  if (S.freeRoads) return `Construcción de carreteras: colocá ${S.freeRoads} gratis`;
  if (confirmBuild) return 'Confirmá la construcción';
  if (mode === 'road') return 'Tocá un borde resaltado';
  if (mode === 'settlement') return 'Tocá una esquina resaltada';
  if (mode === 'city') return 'Tocá uno de tus pueblos';
  return `Salió ${S.dice[0] + S.dice[1]} · construí, comerciá o terminá el turno`;
}

function updateHighlights() {
  if (!S || !myTurn() || S.discards[you]) return scene.setHighlights(null);
  if (S.phase === 'setup') {
    if (S.sub === 'settlement') return scene.setHighlights('vertex', validSettlements(S, you), (v) => act({ type: 'buildSettlement', v }));
    return scene.setHighlights('edge', validRoads(S, you), (e) => act({ type: 'buildRoad', e }));
  }
  if (S.sub === 'jaguar') {
    return scene.setHighlights('tile', validJaguarTiles(S), (tile) => {
      const c = stealCandidates(S, tile, you);
      if (c.length > 1) {
        modal = { kind: 'steal', tile, c };
        render();
      } else act({ type: 'moveJaguar', tile });
    });
  }
  if (S.sub !== 'main') return scene.setHighlights(null);
  if (S.freeRoads || mode === 'road') return scene.setHighlights('edge', validRoads(S, you), (e) => act({ type: 'buildRoad', e }));
  if (mode === 'settlement') return scene.setHighlights('vertex', validSettlements(S, you), (v) => act({ type: 'buildSettlement', v }));
  if (mode === 'city') return scene.setHighlights('city', validCities(S, you), (v) => act({ type: 'buildCity', v }));
  if (confirmBuild) return scene.setHighlights([{ kind: KIND_OF[confirmBuild.kind], ids: [confirmBuild.id], onPick: () => ACT.confirmBuild() }]);
  if (tradeDraft) return scene.setHighlights(null);
  // Sin elegir nada: se sugieren todas las jugadas que te alcanzan; tocarlas pide confirmación.
  const groups = [];
  const ask = (kind) => (id) => {
    confirmBuild = { kind, id };
    render();
  };
  if (canBuild('settlement')) groups.push({ kind: 'vertex', ids: validSettlements(S, you), onPick: ask('settlement'), soft: true });
  if (canBuild('city')) groups.push({ kind: 'city', ids: validCities(S, you), onPick: ask('city'), soft: true });
  if (canBuild('road')) groups.push({ kind: 'edge', ids: validRoads(S, you), onPick: ask('road'), soft: true });
  scene.setHighlights(groups.length ? groups : null);
}

const KIND_OF = { road: 'edge', settlement: 'vertex', city: 'city' };
const PIECE = { road: 'Carretera', settlement: 'Pueblo', city: 'Ciudad' };
const BUILD_ACTION = { road: (e) => ({ type: 'buildRoad', e }), settlement: (v) => ({ type: 'buildSettlement', v }), city: (v) => ({ type: 'buildCity', v }) };

function suggestionStillValid(c) {
  if (!canBuild(c.kind)) return false;
  const ids = c.kind === 'road' ? validRoads(S, you) : c.kind === 'settlement' ? validSettlements(S, you) : validCities(S, you);
  return ids.includes(c.id);
}

function renderConfirm() {
  const el = $('confirm');
  if (!S || !confirmBuild) {
    el.className = '';
    el.innerHTML = '';
    return;
  }
  const { kind, id } = confirmBuild;
  const pt = scene.screenPoint(KIND_OF[kind], id);
  el.className = 'show';
  el.innerHTML = `<div class="bubble">
    <b>${PIECE[kind]}</b>${costRow(COSTS[kind])}
    <div class="yn"><button class="btn small" data-act="cancelBuild" aria-label="cancelar">${UI.cross}</button>
    <button class="btn primary small" data-act="confirmBuild" aria-label="construir">${UI.check} Construir</button></div></div>`;
  const w = el.offsetWidth;
  const x = Math.max(8, Math.min(window.innerWidth - w - 8, pt.x - w / 2));
  const y = Math.max(70, pt.y - el.offsetHeight - 26);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

// ---------- HTML ----------

const icon = (r) => `<i class="ico">${ICONS[r]}</i>`;
const bundle = (b) =>
  RES.filter((r) => b[r])
    .map((r) => `<span class="mini" title="${RES_INFO[r].label}">${icon(r)}<b>${b[r]}</b></span>`)
    .join('') || '<span class="muted">nada</span>';

function picker(key, values, max, hint) {
  return `<div class="picker">${RES.map((r) => {
    const n = values[r];
    return `<div class="pick ${n ? 'on' : ''}">
      <button class="step" data-act="inc" data-k="${key}" data-r="${r}" ${n >= max(r) ? 'disabled' : ''} aria-label="más ${r}">+</button>
      <div class="pick-card">${icon(r)}<b>${n}</b></div>
      <button class="step" data-act="dec" data-k="${key}" data-r="${r}" ${n <= 0 ? 'disabled' : ''} aria-label="menos ${r}">−</button>
      <small>${hint ? hint(r) : RES_INFO[r].label}</small>
    </div>`;
  }).join('')}</div>`;
}

function renderScreen() {
  const el = $('screen');
  $('ui').hidden = !S;
  if (S) {
    el.innerHTML = '';
    el.className = '';
    return;
  }
  el.className = 'show';
  const offline = connected ? '' : '<p class="muted">Conectando con el servidor…</p>';
  if (lobby && lobby.players) {
    const host = you === 0;
    const allReady = lobby.players.every((p) => p.ready);
    el.innerHTML = `<div class="sheet">
      <h1>Litoral</h1>
      <p class="muted">Código de la sala</p>
      <div class="code">${esc(lobby.code)}</div>
      <button class="btn ghost" data-act="copy">Copiar enlace para invitar</button>
      <div class="setting">
        <span>Tiempo por turno</span>
        ${host
          ? `<div class="opts">${TURN_OPTIONS.map((n) => `<button class="opt ${lobby.settings.turnSeconds === n ? 'on' : ''}" data-act="setTime" data-n="${n}">${fmtSecs(n)}</button>`).join('')}</div>`
          : `<b>${fmtSecs(lobby.settings.turnSeconds)}</b>`}
        ${lobby.settings.turnSeconds ? '<small>Cada construcción, carta o intercambio suma 10 s. Si se acaba el tiempo, el turno se completa solo.</small>' : ''}
      </div>
      <div class="setting">
        <span>Mostrar cuántas cartas quedan en el banco</span>
        ${host
          ? `<div class="opts">${[[true, 'Sí'], [false, 'No']].map(([v, l]) => `<button class="opt ${lobby.settings.showBank === v ? 'on' : ''}" data-act="setBank" data-v="${v ? 1 : 0}">${l}</button>`).join('')}</div>`
          : `<b>${lobby.settings.showBank ? 'Sí' : 'No'}</b>`}
        ${lobby.settings.showBank ? '' : '<small>Nadie ve las cantidades del banco: hay que llevar la cuenta de memoria.</small>'}
      </div>
      <ul class="roster">${lobby.players
        .map((p, i) => `<li><span class="dot" style="background:${p.color}"></span>${esc(p.name)}${i === 0 ? ' <em>anfitrión</em>' : ''}${i === you ? ' <em>vos</em>' : ''}<span class="rdy ${p.ready ? 'on' : ''}">${p.ready ? 'Listo' : 'Esperando'}</span></li>`)
        .join('')}</ul>
      ${host
        ? `<button class="btn primary" data-act="start" ${lobby.players.length < 2 || !allReady ? 'disabled' : ''}>Empezar partida</button>
           <p class="muted">${lobby.players.length < 2 ? 'Esperando a que entre alguien más (de 2 a 6 jugadores).' : allReady ? 'Están todos listos. ¡A jugar!' : 'Esperando a que todos marquen "Estoy listo".'}</p>`
        : `<button class="btn ${lobby.players[you].ready ? '' : 'primary'}" data-act="ready" data-v="${lobby.players[you].ready ? '0' : '1'}">${lobby.players[you].ready ? 'Ya no estoy listo' : 'Estoy listo'}</button>
           <p class="muted">Cuando todos estén listos, ${esc(lobby.players[0].name)} empieza la partida.</p>`}
      <button class="btn link" data-act="leave">Salir de la sala</button>
      ${offline}
    </div>`;
    return;
  }
  if (el.querySelector('#name')) return; // no pisar lo que se está escribiendo
  const urlCode = new URLSearchParams(location.search).get('sala') || '';
  el.innerHTML = `<div class="sheet">
    <h1>Litoral</h1>
    <div class="byline">by <b>Rocket Flame</b></div>
    <p class="lead">Poblá la isla: juntá recursos, construí carreteras y comerciá con tus amigos.</p>
    ${notice ? `<p class="notice">${esc(notice)}</p>` : ''}
    <label>Tu nombre<input id="name" maxlength="16" autocomplete="off" value="${esc(localStorage.getItem('litoral.name') || '')}" placeholder="Nombre" /></label>
    <button class="btn primary" data-act="create">Crear sala</button>
    <div class="or">o</div>
    <label>Código de sala<input id="code" maxlength="4" autocomplete="off" autocapitalize="characters" value="${esc(urlCode)}" placeholder="ABCD" /></label>
    <button class="btn" data-act="join">Unirme</button>
    ${offline}
  </div>`;
}

function renderPlayers() {
  $('players').innerHTML =
    S.players
      .map((p) => {
        const turn = S.turn === p.id && S.phase !== 'ended';
        const award = (on) => (on ? 'award' : '');
        return `<div class="player ${turn ? 'turn' : ''} ${online[p.id] ? '' : 'off'}" data-pid="${p.id}" style="--c:${p.color}">
          <div class="who">
            <span class="avatar">${esc(p.name.slice(0, 1).toUpperCase())}</span>
            <b>${esc(p.name)}</b>${p.id === you ? '<em>vos</em>' : ''}${online[p.id] ? '' : '<em class="offline">desconectado</em>'}
            <span class="vp" title="${p.realPoints !== undefined && p.realPoints !== p.points ? `Los demás ven ${p.points}; con tus puntos de victoria ocultos tenés ${p.realPoints}` : 'Puntos de victoria'}">${UI.vp}${p.points}${p.realPoints !== undefined && p.realPoints !== p.points ? `<small class="real">(${p.realPoints})</small>` : ''}</span>
          </div>
          <div class="badges">
            <span class="b ${p.handCount > 7 ? 'danger' : ''}" title="Cartas de recurso en la mano">${UI.cards}<b>${p.handCount}</b></span>
            <span class="b" title="Cartas de desarrollo">${UI.dev}<b>${p.devCount}</b></span>
            <span class="b ${award(S.largest === p.id)}" title="Caballeros jugados${S.largest === p.id ? ' · Ejército más grande (+2)' : ''}">${UI.knight}<b>${p.guard}</b></span>
            <span class="b ${award(S.longest === p.id)}" title="Carretera más larga${S.longest === p.id ? ' · Gran Ruta Comercial (+2)' : ''}">${UI.road}<b>${p.roadLen}</b></span>
          </div>
          ${turn ? `<div class="turnline">${p.id === you ? 'Tu turno' : 'Su turno'} <b class="clockv"></b></div>` : ''}
        </div>`;
      })
      .join('') +
    `<div class="tools">
      <button class="chip icon-only" data-act="pause" data-v="${paused ? 0 : 1}" title="${paused ? 'Reanudar' : 'Pausar la partida'}" aria-label="${paused ? 'Reanudar' : 'Pausar'}">${paused ? UI.play : UI.pause}</button>
      <button class="chip icon-only ${menuOpen ? 'on' : ''}" data-act="menu" title="Menú" aria-label="Menú">${UI.gear}</button>
      <button class="chip only-narrow ${bankOpen ? 'on' : ''}" data-act="bankPanel" id="bankBtn">${UI.bank}<span>Banco</span></button>
      <button class="chip only-narrow ${logOpen && sideTab === 'chat' ? 'on' : ''}" data-act="openChat" id="chatBtn">${UI.chat}<span>Chat</span>${unread ? `<i class="badge">${unread}</i>` : ''}</button>
      <button class="chip only-narrow ${logOpen && sideTab === 'log' ? 'on' : ''}" data-act="log">Crónica</button>
      <span class="room">Sala ${esc(lobby.code)}</span>
    </div>`;
}

function renderLog() {
  const el = $('log');
  el.className = logOpen ? 'open' : '';
  if (!el.dataset.ready) {
    el.dataset.ready = '1';
    el.innerHTML = `<h3><span class="tabs"><button data-act="tab" data-t="log">Crónica</button><button data-act="tab" data-t="chat">Chat <i class="badge"></i></button></span>
      <button class="x only-narrow" data-act="closeSide" aria-label="cerrar">×</button></h3>
      <ol class="loglist"></ol>
      <div class="chatbox"><ol class="chatlist"></ol>
        <form class="chatform" data-form="chat"><input id="chatInput" maxlength="200" autocomplete="off" placeholder="Escribí un mensaje…" />
        <button class="btn small" aria-label="enviar">${UI.send}</button></form></div>`;
  }
  el.dataset.tab = sideTab;
  el.querySelectorAll('[data-act="tab"]').forEach((b) => b.classList.toggle('on', b.dataset.t === sideTab));
  el.querySelector('.tabs .badge').textContent = unread ? unread : '';
  const ol = el.querySelector('.loglist');
  ol.innerHTML = S.log.slice(-40).map((l) => `<li>${fmtLog(l)}</li>`).join('');
  ol.scrollTop = ol.scrollHeight;
  const cl = el.querySelector('.chatlist');
  cl.innerHTML = chat.length
    ? chat.map((c) => `<li class="${c.from === you ? 'mine' : ''}"><b style="color:${c.color}">${esc(c.name)}</b> ${esc(c.text)}</li>`).join('')
    : '<li class="muted">Todavía no hay mensajes.</li>';
  cl.scrollTop = cl.scrollHeight;
  if (sideTab === 'chat' && (logOpen || !window.matchMedia('(max-width: 860px)').matches)) unread = 0;
}

// Convierte una línea de la crónica en texto con íconos y nombres de colores.
const CARD_BY_LABEL = Object.fromEntries(Object.entries(CARD_INFO).map(([id, c]) => [c.label, id]));
function fmtLog(line) {
  // Los nombres se marcan primero para que ningún reemplazo posterior los toque.
  const names = S.players.slice().sort((a, b) => b.name.length - a.name.length);
  let h = line;
  names.forEach((p) => (h = h.split(p.name).join(`${p.id}`)));
  h = esc(h);
  const first = S.players
    .map((p) => ({ p, i: line.indexOf(p.name) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)[0]?.p;
  const tint = first ? first.color : '#8a6234';
  const piece = (k) => `<i class="lp" style="color:${tint}">${PIECE_ICON[k]}</i>`;
  for (const [label, id] of Object.entries(CARD_BY_LABEL)) {
    h = h.replace(label, `${id}`);
  }
  h = h.replace(/(\d+ )?\b(madera|ladrillo|lana|trigo|piedra)\b/g, (m, n, r) => `<span class="lr" title="${RES_INFO[r].label}">${n ? `<b>${n.trim()}</b>` : ''}${icon(r)}</span>`);
  h = h.replace(/\b(un pueblo|una ciudad|una carretera|carreteras?)\b/g, (m) => `${piece(m.includes('pueblo') ? 'settlement' : m.includes('ciudad') ? 'city' : 'road')}${m}`);
  h = h.replace(/\b(el ladrón)/g, (m) => `<i class="lp">${PIECE_ICON.robber}</i>${m}`);
  h = h.replace(/\btira (\d+)/g, (m, n) => `tira <i class="lp">${PIECE_ICON.dice}</i><b class="ldice ${n === '7' ? 'seven' : ''}">${n}</b>`);
  h = h.replace(/(\w+)/g, (m, id) => `<i class="ldev">${DEV_ART[id]}</i><b>${CARD_INFO[id].label}</b>`);
  h = h.replace(/(\d+)/g, (m, i) => `<b class="pname" style="--c:${S.players[i].color}">${esc(S.players[i].name)}</b>`);
  return h;
}

let chatToastTimer = null;
function toastChat(c) {
  const el = $('chattoast');
  el.innerHTML = `<b style="color:${c.color}">${esc(c.name)}</b> ${esc(c.text)}`;
  el.classList.add('show');
  clearTimeout(chatToastTimer);
  chatToastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

function costRow(cost) {
  return `<span class="cost">${RES.filter((r) => cost[r]).map((r) => icon(r).repeat(cost[r])).join('')}</span>`;
}

function renderBottom() {
  const hand = me().hand;
  const total = RES.reduce((n, r) => n + hand[r], 0);
  const handEl = $('hand');
  handEl.className = total > 7 && S.phase === 'play' ? 'danger' : '';
  handEl.title = total > 7 ? `Tenés ${total} cartas: si sale un 7, perdés la mitad.` : '';
  handEl.innerHTML = RES.map((r) => {
    const n = Math.max(0, hand[r] - incoming[r]);
    const tappable = inMain() && hand[r] > (tradeDraft ? tradeDraft.give[r] : 0);
    return `<div class="card ${n ? '' : 'empty'} ${tappable ? 'tap' : ''}" data-r="${r}" ${tappable ? `data-act="handCard"` : ''} style="--c:${RES_INFO[r].color}">
      ${icon(r)}<span class="n">${n}</span><small>${RES_INFO[r].label}</small></div>`;
  }).join('') + (total > 7 && S.phase === 'play' ? `<div class="warn">${total} cartas: ¡cuidado con el 7!</div>` : '');

  const dice = S.dice ? `<div class="dice" title="Última tirada"><span>${S.dice[0]}</span><span>${S.dice[1]}</span></div>` : '';
  let html = '';
  if (S.phase === 'play' && myTurn() && S.sub === 'roll') {
    html = `<button class="btn primary big" data-act="roll">Tirar dados</button>`;
  } else if (S.phase === 'play') {
    const b = (kind, label) =>
      `<button class="btn build ${mode === kind ? 'active' : ''}" data-act="mode" data-m="${kind}" ${canBuild(kind) ? '' : 'disabled'}>
        <span>${label}</span>${costRow(COSTS[kind])}</button>`;
    html = `${b('road', 'Carretera')}${b('settlement', 'Pueblo')}${b('city', 'Ciudad')}
      <button class="btn ${tradeDraft ? 'active' : ''}" data-act="trade" ${inMain() ? '' : 'disabled'}>${UI.trade}<span>Comerciar</span></button>
      <button class="btn primary" data-act="end" ${inMain() ? '' : 'disabled'}>Terminar turno</button>`;
  }
  const cards = S.phase === 'play' ? `<button class="btn" data-act="cards">${UI.dev}<span>Desarrollo</span> <b>${me().dev.length + me().newDev.length}</b></button>` : '';
  $('actions').innerHTML = dice + html + cards;
}

function composerHTML() {
  const { give, get } = tradeDraft;
  const g = RES.filter((r) => give[r]);
  const w = RES.filter((r) => get[r]);
  const overlap = g.some((r) => get[r]);
  const credits = bankCredits(S, you, give);
  const want = sum(get);
  const bankStock = !S.bank || RES.every((r) => S.bank[r] >= get[r]);
  const bankOk = g.length && w.length && !overlap && credits > 0 && credits === want && bankStock;
  const offerOk = g.length && w.length && !overlap && !S.trade;
  let hint = 'Tocá tus cartas para ofrecerlas y elegí arriba qué querés recibir.';
  if (g.length && credits < 0) hint = `Con el banco se cambia de a ${g.map((r) => `${bankRate(S, you, r)} ${RES_INFO[r].label.toLowerCase()}`).join(', ')}.`;
  else if (g.length && credits >= 0 && credits !== want) hint = `Con el banco, lo que das vale ${credits} carta${credits === 1 ? '' : 's'}.`;
  else if (bankOk) hint = 'Podés cambiarlo con el banco o ofrecerlo a los jugadores.';
  if (overlap) hint = 'No podés dar y pedir el mismo recurso.';
  const chip = (b, key) =>
    RES.filter((r) => b[r])
      .map((r) => `<span class="tcell"><button class="tchip" data-act="tdec" data-k="${key}" data-r="${r}" title="Quitar una" style="--c:${RES_INFO[r].color}">${icon(r)}<b>${b[r]}</b></button><button class="tminus" data-act="tdec" data-k="${key}" data-r="${r}" aria-label="Quitar una">−</button></span>`)
      .join('');
  return `<div class="composer">
    <div class="trow"><span class="lbl">Pedís</span>
      <div class="tpick">${RES.map((r) => `<span class="tcell"><button class="tres ${get[r] ? 'on' : ''}" data-act="tinc" data-k="get" data-r="${r}" style="--c:${RES_INFO[r].color}" title="Pedir una ${RES_INFO[r].label.toLowerCase()} más">${icon(r)}${get[r] ? `<b>${get[r]}</b>` : ''}</button>${get[r] ? `<button class="tminus" data-act="tdec" data-k="get" data-r="${r}" aria-label="Pedir una menos">−</button>` : ''}</span>`).join('')}</div>
      <button class="x" data-act="trade" aria-label="cerrar">×</button></div>
    <div class="trow"><span class="lbl">Das</span><div class="tgive">${chip(give, 'give') || '<span class="muted">Tocá tus cartas abajo</span>'}</div></div>
    <div class="trow tacts"><small class="hint">${hint}</small>
      <button class="btn small" data-act="bankTrade" ${bankOk ? '' : 'disabled'}>${UI.bank}<span>Banco</span></button>
      <button class="btn primary small" data-act="offer" ${offerOk ? '' : 'disabled'}>Ofrecer a jugadores</button></div>
  </div>`;
}

function renderTradeBar() {
  const el = $('tradebar');
  const t = S.trade;
  const composer = tradeDraft ? composerHTML() : '';
  if (!t) {
    el.innerHTML = composer;
    return;
  }
  if (t.from === you) {
    el.innerHTML = `<div class="offer">
      <div><b>Tu oferta</b> ${bundle(t.give)} <span class="arrow">por</span> ${bundle(t.get)}</div>
      <div class="answers">${S.players
        .filter((p) => p.id !== you)
        .map((p) => {
          const r = t.responses[p.id];
          return r === 'accept'
            ? `<button class="btn primary small" data-act="accept" data-p="${p.id}">Cerrar con ${esc(p.name)}</button>`
            : `<span class="ans ${r || ''}">${esc(p.name)}: ${r === 'reject' ? 'no' : '…'}</span>`;
        })
        .join('')}
        <button class="btn small" data-act="cancelTrade">Retirar</button></div>
    </div>${composer}`;
  } else {
    const mine = t.responses[you];
    const can = canAfford(me().hand, t.get);
    el.innerHTML = `<div class="offer">
      <div><b>${esc(S.players[t.from].name)}</b> te da ${bundle(t.give)} <span class="arrow">por</span> ${bundle(t.get)}</div>
      <div class="answers">
        ${mine === 'accept' ? '<span class="ans accept">Aceptaste. Falta que confirme.</span>' : `<button class="btn primary small" data-act="respond" data-v="1" ${can ? '' : 'disabled'}>Aceptar</button>`}
        ${mine === 'reject' ? '<span class="ans reject">Rechazaste</span>' : '<button class="btn small" data-act="respond" data-v="0">Rechazar</button>'}
      </div>
    </div>`;
  }
}

function modalHTML() {
  if (S.phase === 'ended') {
    const rank = S.players.slice().sort((a, b) => b.points - a.points);
    return `<h2>${S.winner === you ? '¡Ganaste!' : `Ganó ${esc(S.players[S.winner].name)}`}</h2>
      <ul class="roster">${rank.map((p) => `<li><span class="dot" style="background:${p.color}"></span>${esc(p.name)}<em>${p.points} puntos</em></li>`).join('')}</ul>
      ${you === 0 ? '<button class="btn primary" data-act="start">Jugar otra vez</button>' : '<p class="muted">El anfitrión puede empezar otra partida.</p>'}`;
  }
  if (S.discards[you]) {
    if (!modal || modal.kind !== 'discard') modal = { kind: 'discard', cards: zero() };
    const need = S.discards[you];
    const hand = me().hand;
    const total = sum(hand);
    const n = sum(modal.cards);
    const done = n === need;
    return `<h2>Salió un 7</h2>
      <div class="dsum">
        <span>Tenés <b>${total}</b></span><span class="arrow">→</span>
        <span class="keepn">Te quedás con <b>${total - need}</b></span>
        <span class="dclock">Quedan <b class="clockv"></b></span>
      </div>
      <h4>Te quedás con <span class="muted">— tocá una carta para descartarla</span></h4>
      <div class="keep">${RES.map((r) => {
        const k = hand[r] - modal.cards[r];
        const can = k > 0 && !done;
        return `<button class="kcard ${k ? '' : 'empty'}" data-act="dkeep" data-r="${r}" ${can ? '' : 'disabled'} style="--c:${RES_INFO[r].color}">
          ${icon(r)}<b>${k}</b><small>${RES_INFO[r].label}</small></button>`;
      }).join('')}</div>
      <h4>Descartás <b class="${done ? 'ok' : ''}">${n} de ${need}</b> <span class="muted">— tocá para devolverla</span></h4>
      <div class="toss">${RES.filter((r) => modal.cards[r]).map((r) => `<button class="tchip" data-act="dback" data-r="${r}" style="--c:${RES_INFO[r].color}">${icon(r)}<b>${modal.cards[r]}</b></button>`).join('') || '<span class="muted">Todavía nada</span>'}</div>
      <div class="row">
        <button class="btn" data-act="drandom">Elegir al azar</button>
        <button class="btn primary" data-act="confirmDiscard" ${done ? '' : 'disabled'}>${done ? `Descartar ${need} y quedarme con ${total - need}` : `Faltan ${need - n}`}</button>
      </div>
      <p class="muted">Si se acaba el tiempo, se descartan al azar.</p>`;
  }
  if (!modal) return '';
  const close = '<button class="x" data-act="close" aria-label="cerrar">×</button>';

  if (modal.kind === 'cards') {
    const p = me();
    const counts = {};
    for (const c of p.dev) counts[c] = (counts[c] || 0) + 1;
    const fresh = {};
    for (const c of p.newDev) fresh[c] = (fresh[c] || 0) + 1;
    const rows = Object.keys(CARD_INFO)
      .filter((c) => counts[c] || fresh[c])
      .map((c) => {
        const playable = c !== 'fiesta' && counts[c] && myTurn() && !S.playedCard && !S.freeRoads && (S.sub === 'main' || (S.sub === 'roll' && c === 'baqueano'));
        return `<li><div class="devart">${DEV_ART[c]}<b class="cnt">${(counts[c] || 0) + (fresh[c] || 0)}</b></div>
          <div class="devtext"><b>${CARD_INFO[c].label}</b>${fresh[c] ? ` <em>${fresh[c]} recién comprada${fresh[c] > 1 ? 's' : ''}</em>` : ''}
          <small>${CARD_INFO[c].text}</small></div>
          ${c === 'fiesta' ? '' : `<button class="btn small" data-act="play" data-c="${c}" ${playable ? '' : 'disabled'}>Jugar</button>`}</li>`;
      })
      .join('');
    const canBuy = inMain() && S.deckCount > 0 && canAfford(p.hand, COSTS.card);
    return `${close}<h2>Cartas de desarrollo</h2>
      <ul class="devlist">${rows || '<li class="muted">Todavía no tenés ninguna.</li>'}</ul>
      <button class="btn primary build" data-act="buy" ${canBuy ? '' : 'disabled'}><span>Comprar carta</span>${costRow(COSTS.card)}</button>
      <p class="muted">Quedan ${S.deckCount} en el mazo. Podés jugar una por turno, y no la que compraste en este turno.</p>`;
  }

  if (modal.kind === 'steal') {
    return `<h2>¿A quién le robás una carta?</h2><div class="row">${modal.c
      .map((p) => `<button class="btn" data-act="victim" data-p="${p}"><span class="dot" style="background:${S.players[p].color}"></span>${esc(S.players[p].name)}</button>`)
      .join('')}</div>`;
  }

  if (modal.kind === 'feria') {
    return `${close}<h2>Monopolio</h2><p>Elegí el recurso: todos te dan todas las que tengan.</p><div class="row">${RES.map(
      (r) => `<button class="btn resbtn" data-act="feria" data-r="${r}">${icon(r)}${RES_INFO[r].label}</button>`,
    ).join('')}</div>`;
  }

  if (modal.kind === 'cosecha') {
    const n = sum(modal.pick);
    return `${close}<h2>Descubrimiento</h2><p>Elegí 2 recursos del banco.</p>
      ${picker('pick', modal.pick, (r) => Math.min(S.bank ? S.bank[r] : 2, modal.pick[r] + 2 - n), S.bank ? (r) => `banco ${S.bank[r]}` : null)}
      <button class="btn primary" data-act="cosecha" ${n === 2 ? '' : 'disabled'}>Tomar</button>`;
  }

  if (modal.kind === 'settings') {
    const toggle = (key, label, note) => `<label class="toggle"><span><b>${label}</b><small>${note}</small></span>
      <input type="checkbox" data-pref="${key}" ${prefs[key] ? 'checked' : ''} /><i></i></label>`;
    return `${close}<h2>Ajustes</h2>
      <div class="prefs">
        ${toggle('sound', 'Sonidos', 'Dados, construcciones, ladrón, turno y chat.')}
        <label class="slider"><span><b>Volumen</b></span><input type="range" min="0" max="1" step="0.05" value="${prefs.volume}" data-pref="volume" ${prefs.sound ? '' : 'disabled'} /></label>
        ${toggle('ticks', 'Tic-tac del reloj', 'Suena en los últimos 10 segundos de tu turno.')}
        ${toggle('anim', 'Animación de cartas', 'Las cartas vuelan entre el banco, tu mano y los jugadores.')}
      </div>
      <button class="btn" data-act="testSound">Probar sonido</button>`;
  }

  if (modal.kind === 'leave') {
    return `${close}<h2>¿Salir de la partida?</h2>
      <p>Tu lugar queda en la partida: cuando sea tu turno, el juego tira y pasa solo. Si salís, no vas a poder volver a entrar a esta partida.</p>
      <div class="row"><button class="btn" data-act="close">Seguir jugando</button><button class="btn danger" data-act="leave">Salir</button></div>`;
  }

  if (modal.kind === 'rules') {
    const line = (label, cost, note) => `<li><b>${label}</b>${costRow(cost)}<small>${note}</small></li>`;
    return `${close}<h2>Cómo se juega</h2>
      <p>Gana quien llega primero a <b>${WIN_POINTS} puntos</b> en su turno.</p>
      <ul class="costs">
        ${line('Carretera', COSTS.road, 'Conecta tus pueblos. 5 o más seguidas dan la Gran Ruta Comercial (2 puntos).')}
        ${line('Pueblo', COSTS.settlement, '1 punto. Tiene que estar a dos esquinas o más de cualquier otro.')}
        ${line('Ciudad', COSTS.city, '2 puntos. Reemplaza a un pueblo y produce el doble.')}
        ${line('Carta de desarrollo', COSTS.card, 'Caballero, Construcción de carreteras, Descubrimiento, Monopolio o Punto de victoria. 3 caballeros jugados dan el Ejército más grande (2 puntos).')}
      </ul>
      <p>Cada tirada, los terrenos con ese número dan su recurso a quienes tengan un pueblo o una ciudad en sus esquinas:
        ${RES.map((r) => `<span class="mini">${icon(r)}${RES_INFO[r].terrain}</span>`).join(' ')}. El desierto no produce.</p>
      <p>Con un <b>7</b>, quien tenga más de 7 cartas descarta la mitad (tiene 15 segundos) y quien tiró mueve el <b>ladrón</b>: ese terreno deja de producir y le roba una carta a un jugador de ahí.</p>
      <p>Comercio: tocá tus cartas para armar un intercambio. Con el banco es 4:1, 3:1 con un puerto genérico y 2:1 con un puerto de ese recurso; podés cambiar varios grupos juntos.</p>
      <p>Tenés 5 segundos para tirar los dados; si no, se tiran solos. Arrastrá para girar la isla, pellizcá o usá la rueda para acercarte.</p>`;
  }
  return '';
}

function renderMenu() {
  const el = $('menu');
  el.className = S && menuOpen ? 'show' : '';
  el.innerHTML = S && menuOpen
    ? `<button data-act="openSettings">${UI.gear}<span>Ajustes</span></button>
       <button data-act="pause" data-v="${paused ? 0 : 1}">${paused ? UI.play : UI.pause}<span>${paused ? 'Reanudar' : 'Pausar la partida'}</span></button>
       <button data-act="openRules">${UI.dev}<span>Reglas</span></button>
       <button class="danger" data-act="askLeave">${UI.cross}<span>Salir de la partida</span></button>`
    : '';
}

function renderPause() {
  const el = $('pause');
  const on = S && paused && S.phase !== 'ended';
  el.className = on ? 'show' : '';
  el.innerHTML = on
    ? `<div class="sheet"><div class="pauseicon">${UI.pause}</div><h2>Partida en pausa</h2>
       <p>La pausó <b style="color:${S.players[paused.by]?.color || 'inherit'}">${esc(paused.name)}</b>. El reloj está detenido.</p>
       <button class="btn primary" data-act="pause" data-v="0">${UI.play} Reanudar</button>
       <p class="muted">Cualquier jugador puede reanudarla.</p></div>`
    : '';
}

function renderModal() {
  const html = S ? modalHTML() : '';
  const el = $('modal');
  el.className = html ? 'show' : '';
  el.innerHTML = html ? `<div class="sheet">${html}</div>` : '';
}

function render() {
  renderScreen();
  if (S) {
    renderPlayers();
    $('status').innerHTML = `<span class="${myTurn() || S.discards[you] ? 'mine' : ''}">${statusText()}<b id="clock"></b></span>`;
    tickClock();
    renderLog();
    renderBank();
    renderBottom();
    renderTradeBar();
  }
  renderModal();
  renderMenu();
  renderPause();
  updateHighlights();
  renderConfirm();
  if (pendingFlows) {
    const { flows, delay } = pendingFlows;
    pendingFlows = null;
    setTimeout(() => animateFlows(flows), delay);
  }
}

// ---------- Banco ----------

function renderBank() {
  const el = $('bank');
  el.className = bankOpen ? 'open' : '';
  const shown = !!S.bank;
  el.innerHTML = `<h3>Banco ${shown ? '' : '<small>oculto</small>'}<button class="x only-narrow" data-act="bankPanel" aria-label="cerrar">×</button></h3>
    <div class="stacks">${RES.map((r) => {
      const n = shown ? S.bank[r] : null;
      return `<div class="stack ${n === 0 ? 'empty' : ''} ${n !== null && n <= 3 ? 'low' : ''}" data-r="${r}" style="--c:${RES_INFO[r].color}" title="${RES_INFO[r].label}">
        <div class="mini-card">${icon(r)}</div><b>${n === null ? '?' : n}</b><small>${RES_INFO[r].label}</small></div>`;
    }).join('')}</div>`;
}

// ---------- Animación de cartas ----------

const visible = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

function anchorFor(who, res) {
  if (who === 'bank') {
    const slot = document.querySelector(`#bank .stack[data-r="${res}"]`);
    if (visible(slot) && visible($('bank'))) return slot;
    if (visible($('bankBtn'))) return $('bankBtn');
    return $('status');
  }
  if (who === you) return document.querySelector(`#hand .card[data-r="${res}"]`) || $('hand');
  return document.querySelector(`.player[data-pid="${who}"]`);
}

let lastCardSound = 0;
function landMine(res, silent) {
  if (incoming[res] <= 0) return;
  incoming[res]--;
  if (!silent && performance.now() - lastCardSound > 60) {
    lastCardSound = performance.now();
    play('card');
  }
  const card = document.querySelector(`#hand .card[data-r="${res}"]`);
  if (!card || !S) return;
  const n = Math.max(0, me().hand[res] - incoming[res]);
  card.querySelector('.n').textContent = n;
  card.classList.toggle('empty', !n);
}

function animateFlows(flows) {
  const still = !S || !prefs.anim || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let k = 0;
  for (const f of flows) {
    const mine = f.to === you && f.res;
    const from = still ? null : anchorFor(f.from, f.res);
    const to = still ? null : anchorFor(f.to, f.res);
    const flying = from && to ? Math.min(f.n, 6) : 0;
    for (let i = 0; i < flying; i++) flyCard(f.res, from, to, k++ * 70, mine ? () => landMine(f.res) : null);
    if (mine) for (let i = flying; i < f.n; i++) landMine(f.res, true);
  }
}

function flyCard(res, from, to, delay, onLand) {
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const card = document.createElement('div');
  card.className = `fly ${res ? '' : 'back'}`;
  if (res) {
    card.style.setProperty('--c', RES_INFO[res].color);
    card.innerHTML = icon(res);
  }
  const x0 = a.left + a.width / 2 - 22;
  const y0 = a.top + a.height / 2 - 30;
  const x1 = b.left + b.width / 2 - 22;
  const y1 = b.top + b.height / 2 - 30;
  card.style.left = `${x0}px`;
  card.style.top = `${y0}px`;
  card.style.opacity = '0';
  document.body.appendChild(card);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lift = -Math.min(120, 40 + Math.abs(dx) * 0.15);
  const anim = card.animate(
    [
      { transform: 'translate(0, 0) scale(0.7) rotate(-8deg)', opacity: 0 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + lift}px) scale(1.15) rotate(4deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.85) rotate(0deg)`, opacity: 1 },
    ],
    { duration: 460, delay, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'forwards' },
  );
  anim.onfinish = () => {
    card.remove();
    if (onLand) onLand();
    to.classList.remove('pop');
    void to.offsetWidth;
    to.classList.add('pop');
    setTimeout(() => to.classList.remove('pop'), 350);
  };
}

// ---------- Acciones de la interfaz ----------

const nameValue = () => {
  const name = ($('name')?.value || '').trim();
  if (!name) toast('Poné tu nombre.');
  else localStorage.setItem('litoral.name', name);
  return name;
};
const closeModal = () => {
  modal = null;
  render();
};

const ACT = {
  create: () => {
    const name = nameValue();
    if (name) send({ t: 'create', name });
  },
  join: () => {
    const name = nameValue();
    const code = ($('code').value || '').trim().toUpperCase();
    if (name && code.length === 4) send({ t: 'join', code, name });
    else if (name) toast('El código tiene 4 letras.');
  },
  leave: () => {
    modal = null;
    menuOpen = false;
    S = null;
    session.clear();
    history.replaceState(null, '', location.pathname);
    lobby = null;
    ws.close();
  },
  start: () => send({ t: 'start' }),
  ready: (d) => send({ t: 'ready', v: d.v === '1' }),
  setTime: (d) => send({ t: 'settings', turnSeconds: Number(d.n) }),
  setBank: (d) => send({ t: 'settings', showBank: d.v === '1' }),
  bankPanel: () => {
    bankOpen = !bankOpen;
    if (bankOpen) logOpen = false;
    render();
  },
  copy: async () => {
    const url = `${location.origin}/?sala=${lobby.code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Enlace copiado.');
    } catch {
      toast(url);
    }
  },
  roll: () => act({ type: 'roll' }),
  end: () => {
    mode = null;
    tradeDraft = null;
    confirmBuild = null;
    act({ type: 'endTurn' });
  },
  mode: (d) => {
    mode = mode === d.m ? null : d.m;
    confirmBuild = null;
    tradeDraft = null;
    render();
  },
  trade: () => {
    mode = null;
    confirmBuild = null;
    tradeDraft = tradeDraft ? null : { give: zero(), get: zero() };
    render();
  },
  handCard: (d) => {
    if (!inMain()) return;
    mode = null;
    confirmBuild = null;
    if (!tradeDraft) tradeDraft = { give: zero(), get: zero() };
    if (tradeDraft.give[d.r] < me().hand[d.r]) tradeDraft.give[d.r]++;
    tradeDraft.get[d.r] = 0;
    render();
  },
  tinc: (d) => {
    tradeDraft[d.k][d.r]++;
    if (d.k === 'get') tradeDraft.give[d.r] = 0;
    render();
  },
  tdec: (d) => {
    tradeDraft[d.k][d.r] = Math.max(0, tradeDraft[d.k][d.r] - 1);
    render();
  },
  bankTrade: () => {
    act({ type: 'bankTrade', give: tradeDraft.give, get: tradeDraft.get });
    tradeDraft = null;
    render();
  },
  confirmBuild: () => {
    if (!confirmBuild) return;
    act(BUILD_ACTION[confirmBuild.kind](confirmBuild.id));
    confirmBuild = null;
    render();
  },
  cancelBuild: () => {
    confirmBuild = null;
    render();
  },
  tab: (d) => {
    sideTab = d.t;
    if (d.t === 'chat') unread = 0;
    render();
  },
  openChat: () => {
    const opening = !(logOpen && sideTab === 'chat');
    logOpen = opening;
    sideTab = 'chat';
    if (opening) {
      bankOpen = false;
      unread = 0;
    }
    render();
    if (opening) setTimeout(() => $('chatInput')?.focus(), 50);
  },
  cards: () => {
    modal = { kind: 'cards' };
    render();
  },
  rules: () => {
    modal = { kind: 'rules' };
    render();
  },
  closeSide: () => {
    logOpen = false;
    render();
  },
  menu: () => {
    menuOpen = !menuOpen;
    render();
  },
  openSettings: () => {
    menuOpen = false;
    modal = { kind: 'settings' };
    render();
  },
  openRules: () => {
    menuOpen = false;
    modal = { kind: 'rules' };
    render();
  },
  askLeave: () => {
    menuOpen = false;
    modal = { kind: 'leave' };
    render();
  },
  pause: (d) => {
    menuOpen = false;
    send({ t: 'pause', v: d.v === '1' });
    render();
  },
  testSound: () => {
    unlockAudio();
    play('yourTurn');
    setTimeout(() => play('dice'), 500);
  },
  dkeep: (d) => {
    const need = S.discards[you];
    if (sum(modal.cards) < need && modal.cards[d.r] < me().hand[d.r]) modal.cards[d.r]++;
    play('click');
    render();
  },
  dback: (d) => {
    modal.cards[d.r] = Math.max(0, modal.cards[d.r] - 1);
    render();
  },
  drandom: () => {
    const need = S.discards[you];
    const pool = RES.flatMap((r) => Array(me().hand[r]).fill(r));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    modal.cards = zero();
    for (const r of pool.slice(0, need)) modal.cards[r]++;
    render();
  },
  log: () => {
    if (!logOpen || sideTab === 'log') logOpen = !logOpen;
    sideTab = 'log';
    if (logOpen) bankOpen = false;
    render();
  },
  close: closeModal,
  inc: (d) => {
    modal[d.k][d.r]++;
    render();
  },
  dec: (d) => {
    modal[d.k][d.r]--;
    render();
  },
  offer: () => {
    act({ type: 'offerTrade', give: tradeDraft.give, get: tradeDraft.get });
    tradeDraft = null;
    render();
  },
  respond: (d) => act({ type: 'respondTrade', accept: d.v === '1' }),
  accept: (d) => act({ type: 'acceptTrade', with: Number(d.p) }),
  cancelTrade: () => act({ type: 'cancelTrade' }),
  confirmDiscard: () => {
    act({ type: 'discard', cards: modal.cards });
    modal = null;
  },
  buy: () => act({ type: 'buyCard' }),
  play: (d) => {
    if (d.c === 'feria') modal = { kind: 'feria' };
    else if (d.c === 'cosecha') modal = { kind: 'cosecha', pick: zero() };
    else {
      act({ type: 'playCard', card: d.c });
      modal = null;
    }
    render();
  },
  feria: (d) => {
    act({ type: 'playCard', card: 'feria', res: d.r });
    closeModal();
  },
  cosecha: () => {
    const picks = RES.flatMap((r) => Array(modal.pick[r]).fill(r));
    act({ type: 'playCard', card: 'cosecha', a: picks[0], b: picks[1] });
    closeModal();
  },
  victim: (d) => {
    act({ type: 'moveJaguar', tile: modal.tile, victim: Number(d.p) });
    closeModal();
  },
};

document.addEventListener('click', (ev) => {
  unlockAudio();
  const el = ev.target.closest('[data-act]');
  if (menuOpen && !ev.target.closest('#menu') && !(el && el.dataset.act === 'menu')) {
    menuOpen = false;
    renderMenu();
    renderPlayers();
  }
  if (el && !el.disabled) ACT[el.dataset.act]?.(el.dataset);
});
document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('change', (ev) => {
  const k = ev.target.dataset?.pref;
  if (!k) return;
  prefs[k] = ev.target.type === 'checkbox' ? ev.target.checked : Number(ev.target.value);
  savePrefs();
  if (k === 'sound') render();
});
document.addEventListener('input', (ev) => {
  if (ev.target.dataset?.pref !== 'volume') return;
  prefs.volume = Number(ev.target.value);
  savePrefs();
});
document.addEventListener('submit', (ev) => {
  if (ev.target.dataset.form !== 'chat') return;
  ev.preventDefault();
  const input = $('chatInput');
  const text = input.value.trim();
  if (text) send({ t: 'chat', text });
  input.value = '';
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.id === 'name') ACT[$('code').value ? 'join' : 'create']();
  if (ev.key === 'Enter' && ev.target.id === 'code') ACT.join();
  if (ev.key === 'Escape' && confirmBuild) ACT.cancelBuild();
  else if (ev.key === 'Escape' && modal && !['steal', 'discard'].includes(modal.kind)) closeModal();
});

// Reloj del turno: se actualiza solo, sin redibujar todo.
let lastLeft = null;
let lastTick = null;
let flashUntil = 0;
function tickClock() {
  const el = $('clock');
  const bar = $('timebar');
  if (!el || !bar) return;
  if (!timer || !S || S.phase === 'ended') {
    document.querySelectorAll('.clockv').forEach((c) => (c.textContent = ''));
    el.textContent = '';
    bar.className = '';
    lastLeft = null;
    return;
  }
  const ms = Math.max(0, timer.deadline - (Date.now() + clockOffset));
  const left = Math.ceil(ms / 1000);
  const text = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  el.textContent = text;
  el.className = left <= 10 ? 'low' : '';
  document.querySelectorAll('.clockv').forEach((c) => {
    c.textContent = text;
    c.classList.toggle('low', left <= 5);
  });
  if (lastLeft !== null && left > lastLeft + 3 && left < Math.round(timer.total / 1000)) flashUntil = Date.now() + 900;
  lastLeft = left;
  const mineNow = S.phase !== 'ended' && ((S.turn === you && !S.discards[you] && timer.stage !== 'discard') || (S.discards[you] && timer.stage === 'discard'));
  if (prefs.ticks && mineNow && left <= 10 && left > 0 && left !== lastTick) play('tick', left <= 3);
  lastTick = left;
  const who = S.players[S.turn];
  bar.className = `show${left <= 10 ? ' low' : ''}${Date.now() < flashUntil ? ' flash' : ''}`;
  bar.style.setProperty('--c', who.color);
  bar.querySelector('i').style.width = `${Math.min(100, (ms / timer.total) * 100)}%`;
  bar.querySelector('span').textContent = Date.now() < flashUntil ? `+10 s · ${text}` : `${S.turn === you ? 'Tu turno' : who.name} · ${text}`;
}
setInterval(tickClock, 250);

connect();
render();

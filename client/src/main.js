import { createScene } from './scene.js';
import {
  RES, COSTS, WIN_POINTS, canAfford, validSettlements, validRoads, validCities,
  validJaguarTiles, stealCandidates, bankRate, piecesLeft,
} from '../../shared/game.js';
import { ICONS, RES_INFO, CARD_INFO } from './icons.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const zero = () => Object.fromEntries(RES.map((r) => [r, 0]));
const sum = (b) => RES.reduce((n, r) => n + (b[r] || 0), 0);

const scene = createScene($('board'));
if (new URLSearchParams(location.search).has('debug')) window.__scene = scene;

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
      modal = null;
      mode = null;
    }
    lobby = { code: m.code };
    you = m.you;
    online = m.online;
    timer = m.timer;
    clockOffset = m.now - Date.now();
    S = { ...m.s, board };
    scene.sync(S);
    if (S.rollId !== lastRoll) {
      lastRoll = S.rollId;
      scene.rollDice(S.dice);
    }
    if (!canUseMode()) mode = null;
  } else if (m.t === 'error') {
    toast(m.msg);
  } else if (m.t === 'gone') {
    session.clear();
    lobby = null;
    S = null;
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
    if (!myTurn()) return `${name} está eligiendo dónde instalarse`;
    return S.sub === 'settlement' ? 'Tocá una esquina para fundar tu rancho' : 'Ahora tocá un borde para abrir un camino';
  }
  if (S.sub === 'discard') return 'Salió 7: esperando los descartes';
  if (!myTurn()) return S.sub === 'roll' ? `Turno de ${name}` : `Turno de ${name} · salió ${S.dice[0] + S.dice[1]}`;
  if (S.sub === 'roll') return 'Tu turno: tirá los dados';
  if (S.sub === 'jaguar') return 'Tocá un terreno para mover el yaguareté';
  if (S.freeRoads) return `Picada: colocá ${S.freeRoads} ${S.freeRoads > 1 ? 'caminos' : 'camino'} gratis`;
  if (mode === 'road') return 'Tocá un borde resaltado';
  if (mode === 'settlement') return 'Tocá una esquina resaltada';
  if (mode === 'city') return 'Tocá uno de tus ranchos';
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
  if (mode === 'city') return scene.setHighlights('vertex', validCities(S, you), (v) => act({ type: 'buildCity', v }));
  scene.setHighlights(null);
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
    <p class="lead">Poblá la isla: juntá recursos, abrí caminos y comerciá con tus amigos.</p>
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
        const tags = [];
        if (S.longest === p.id) tags.push('<span class="tag">Picada larga</span>');
        if (S.largest === p.id) tags.push('<span class="tag">Baqueanía</span>');
        return `<div class="player ${S.turn === p.id && S.phase !== 'ended' ? 'turn' : ''} ${online[p.id] ? '' : 'off'}" style="--c:${p.color}">
          <div class="who"><span class="dot"></span><b>${esc(p.name)}</b>${p.id === you ? '<em>vos</em>' : ''}</div>
          <div class="stats">
            <span class="pts" title="Puntos">${p.points}<small>/${WIN_POINTS}</small></span>
            <span title="Cartas de recurso en mano">${p.handCount} <small>cartas</small></span>
            <span title="Cartas de oficio">${p.devCount} <small>oficio</small></span>
            <span title="Baqueanos jugados">${p.guard} <small>baq.</small></span>
            <span title="Camino más largo">${p.roadLen} <small>cam.</small></span>
          </div>
          ${tags.join('')}
        </div>`;
      })
      .join('') +
    `<div class="tools">
      <button class="chip" data-act="rules">Reglas</button>
      <button class="chip only-narrow" data-act="log">Crónica</button>
      <span class="room">Sala ${esc(lobby.code)}</span>
    </div>`;
}

function renderLog() {
  const el = $('log');
  el.className = logOpen ? 'open' : '';
  el.innerHTML = `<h3>Crónica <button class="x only-narrow" data-act="log" aria-label="cerrar">×</button></h3>
    <ol>${S.log.slice(-40).map((l) => `<li>${esc(l)}</li>`).join('')}</ol>`;
  const ol = el.querySelector('ol');
  ol.scrollTop = ol.scrollHeight;
}

function costRow(cost) {
  return `<span class="cost">${RES.filter((r) => cost[r]).map((r) => icon(r).repeat(cost[r])).join('')}</span>`;
}

function renderBottom() {
  const hand = me().hand;
  $('hand').innerHTML = RES.map(
    (r) => `<div class="card ${hand[r] ? '' : 'empty'}" style="--c:${RES_INFO[r].color}">
      ${icon(r)}<span class="n">${hand[r]}</span><small>${RES_INFO[r].label}</small>
      <span class="bank ${S.bank[r] <= 3 ? 'low' : ''}" title="Quedan ${S.bank[r]} en el banco">${S.bank[r]}</span></div>`,
  ).join('') + `<div class="bank-legend" title="Cartas que quedan en el banco de cada recurso">banco</div>`;

  const dice = S.dice ? `<div class="dice" title="Última tirada"><span>${S.dice[0]}</span><span>${S.dice[1]}</span></div>` : '';
  let html = '';
  if (S.phase === 'play' && myTurn() && S.sub === 'roll') {
    html = `<button class="btn primary big" data-act="roll">Tirar dados</button>`;
  } else if (S.phase === 'play') {
    const b = (kind, label) =>
      `<button class="btn build ${mode === kind ? 'active' : ''}" data-act="mode" data-m="${kind}" ${canBuild(kind) ? '' : 'disabled'}>
        <span>${label}</span>${costRow(COSTS[kind])}</button>`;
    html = `${b('road', 'Camino')}${b('settlement', 'Rancho')}${b('city', 'Pueblo')}
      <button class="btn" data-act="trade" ${inMain() ? '' : 'disabled'}>Comerciar</button>
      <button class="btn primary" data-act="end" ${inMain() ? '' : 'disabled'}>Terminar turno</button>`;
  }
  const cards = S.phase === 'play' ? `<button class="btn" data-act="cards">Oficios <b>${me().dev.length + me().newDev.length}</b></button>` : '';
  $('actions').innerHTML = dice + html + cards;
}

function renderTradeBar() {
  const el = $('tradebar');
  const t = S.trade;
  if (!t) {
    el.innerHTML = '';
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
    </div>`;
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
    const n = sum(modal.cards);
    return `<h2>Salió un 7</h2><p>Tenés más de 7 cartas: descartá <b>${need}</b>.</p>
      ${picker('cards', modal.cards, (r) => Math.min(me().hand[r], modal.cards[r] + need - n), (r) => `tenés ${me().hand[r]}`)}
      <button class="btn primary" data-act="confirmDiscard" ${n === need ? '' : 'disabled'}>Descartar ${n}/${need}</button>`;
  }
  if (!modal) return '';
  const close = '<button class="x" data-act="close" aria-label="cerrar">×</button>';

  if (modal.kind === 'trade') {
    const { give, get } = modal;
    const g = RES.filter((r) => give[r]);
    const w = RES.filter((r) => get[r]);
    const bankOk = g.length === 1 && w.length === 1 && g[0] !== w[0] && give[g[0]] === bankRate(S, you, g[0]) * get[w[0]] && S.bank[w[0]] >= get[w[0]];
    const offerOk = g.length && w.length && !g.some((r) => get[r]);
    return `${close}<h2>Comerciar</h2>
      <h4>Das</h4>${picker('give', give, (r) => me().hand[r], (r) => `puerto ${bankRate(S, you, r)}:1`)}
      <h4>Pedís</h4>${picker('get', get, () => 9, (r) => `banco ${S.bank[r]}`)}
      <div class="row">
        <button class="btn primary" data-act="offer" ${offerOk ? '' : 'disabled'}>Ofrecer a los jugadores</button>
        <button class="btn" data-act="bank" ${bankOk ? '' : 'disabled'}>Cambiar en el puerto</button>
      </div>
      <p class="muted">En el puerto entregás varias cartas iguales por una. La proporción mejora si tenés un rancho en un muelle.</p>`;
  }

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
        return `<li><div><b>${CARD_INFO[c].label}</b> ×${(counts[c] || 0) + (fresh[c] || 0)}${fresh[c] ? ` <em>${fresh[c]} recién comprada${fresh[c] > 1 ? 's' : ''}</em>` : ''}
          <small>${CARD_INFO[c].text}</small></div>
          ${c === 'fiesta' ? '' : `<button class="btn small" data-act="play" data-c="${c}" ${playable ? '' : 'disabled'}>Jugar</button>`}</li>`;
      })
      .join('');
    const canBuy = inMain() && S.deckCount > 0 && canAfford(p.hand, COSTS.card);
    return `${close}<h2>Cartas de oficio</h2>
      <ul class="devlist">${rows || '<li class="muted">Todavía no tenés ninguna.</li>'}</ul>
      <button class="btn primary build" data-act="buy" ${canBuy ? '' : 'disabled'}><span>Comprar carta</span>${costRow(COSTS.card)}</button>
      <p class="muted">Quedan ${S.deckCount} en el mazo. Podés jugar una por turno, y no la que compraste en este turno.</p>`;
  }

  if (modal.kind === 'steal') {
    return `<h2>¿A quién le quitás una carta?</h2><div class="row">${modal.c
      .map((p) => `<button class="btn" data-act="victim" data-p="${p}"><span class="dot" style="background:${S.players[p].color}"></span>${esc(S.players[p].name)}</button>`)
      .join('')}</div>`;
  }

  if (modal.kind === 'feria') {
    return `${close}<h2>Feria</h2><p>Elegí el recurso que todos te entregan.</p><div class="row">${RES.map(
      (r) => `<button class="btn resbtn" data-act="feria" data-r="${r}">${icon(r)}${RES_INFO[r].label}</button>`,
    ).join('')}</div>`;
  }

  if (modal.kind === 'cosecha') {
    const n = sum(modal.pick);
    return `${close}<h2>Cosecha</h2><p>Elegí 2 recursos.</p>
      ${picker('pick', modal.pick, (r) => Math.min(S.bank[r], modal.pick[r] + 2 - n), (r) => `banco ${S.bank[r]}`)}
      <button class="btn primary" data-act="cosecha" ${n === 2 ? '' : 'disabled'}>Tomar</button>`;
  }

  if (modal.kind === 'rules') {
    const line = (label, cost, note) => `<li><b>${label}</b>${costRow(cost)}<small>${note}</small></li>`;
    return `${close}<h2>Cómo se juega</h2>
      <p>Gana quien llega primero a <b>${WIN_POINTS} puntos</b> en su turno.</p>
      <ul class="costs">
        ${line('Camino', COSTS.road, 'Conecta tus ranchos. 5 o más seguidos dan la Picada larga (2 puntos).')}
        ${line('Rancho', COSTS.settlement, '1 punto. A dos caminos o más de cualquier otro.')}
        ${line('Pueblo', COSTS.city, '2 puntos. Reemplaza un rancho y produce doble.')}
        ${line('Carta de oficio', COSTS.card, '3 baqueanos jugados dan la Baqueanía (2 puntos).')}
      </ul>
      <p>Cada tirada, los terrenos con ese número dan su recurso a quienes tengan un rancho o pueblo en sus esquinas:
        ${RES.map((r) => `<span class="mini">${icon(r)}${RES_INFO[r].terrain}</span>`).join(' ')}. El desierto no produce.</p>
      <p>Con un <b>7</b>, quien tenga más de 7 cartas descarta la mitad y quien tiró mueve el <b>yaguareté</b>: ese terreno deja de producir y le quita una carta a un vecino.</p>
      <p class="muted">Si ya jugaste a juegos de colonizar islas: rancho = poblado, pueblo = ciudad, yaguareté = ladrón,
        baqueano = caballero, picada = construcción de caminos, cosecha = dos recursos a elección, feria = monopolio,
        fiesta patronal = punto de victoria, muelle = puerto.</p>
      <p>Arrastrá para girar la isla, pellizcá o usá la rueda para acercarte.</p>`;
  }
  return '';
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
    renderBottom();
    renderTradeBar();
  }
  renderModal();
  updateHighlights();
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
    session.clear();
    history.replaceState(null, '', location.pathname);
    lobby = null;
    ws.close();
  },
  start: () => send({ t: 'start' }),
  ready: (d) => send({ t: 'ready', v: d.v === '1' }),
  setTime: (d) => send({ t: 'settings', turnSeconds: Number(d.n) }),
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
    act({ type: 'endTurn' });
  },
  mode: (d) => {
    mode = mode === d.m ? null : d.m;
    render();
  },
  trade: () => {
    mode = null;
    modal = { kind: 'trade', give: zero(), get: zero() };
    render();
  },
  cards: () => {
    modal = { kind: 'cards' };
    render();
  },
  rules: () => {
    modal = { kind: 'rules' };
    render();
  },
  log: () => {
    logOpen = !logOpen;
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
    act({ type: 'offerTrade', give: modal.give, get: modal.get });
    closeModal();
  },
  bank: () => {
    const give = RES.find((r) => modal.give[r]);
    const get = RES.find((r) => modal.get[r]);
    act({ type: 'bankTrade', give, get, n: modal.get[get] });
    closeModal();
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
  const el = ev.target.closest('[data-act]');
  if (el && !el.disabled) ACT[el.dataset.act]?.(el.dataset);
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.id === 'name') ACT[$('code').value ? 'join' : 'create']();
  if (ev.key === 'Enter' && ev.target.id === 'code') ACT.join();
  if (ev.key === 'Escape' && modal && !['steal', 'discard'].includes(modal.kind)) closeModal();
});

// Reloj del turno: se actualiza solo, sin redibujar todo.
let lastLeft = null;
let flashUntil = 0;
function tickClock() {
  const el = $('clock');
  const bar = $('timebar');
  if (!el || !bar) return;
  if (!timer || !S || S.phase === 'ended') {
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
  if (lastLeft !== null && left > lastLeft + 3 && left < Math.round(timer.total / 1000)) flashUntil = Date.now() + 900;
  lastLeft = left;
  const who = S.players[S.turn];
  bar.className = `show${left <= 10 ? ' low' : ''}${Date.now() < flashUntil ? ' flash' : ''}`;
  bar.style.setProperty('--c', who.color);
  bar.querySelector('i').style.width = `${Math.min(100, (ms / timer.total) * 100)}%`;
  bar.querySelector('span').textContent = Date.now() < flashUntil ? `+10 s · ${text}` : `${S.turn === you ? 'Tu turno' : who.name} · ${text}`;
}
setInterval(tickClock, 250);

connect();
render();

// Íconos propios, dibujados en SVG.

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">${body}</svg>`;

export const RES_INFO = {
  madera: { label: 'Madera', color: '#5b7a3a', terrain: 'Bosque' },
  ladrillo: { label: 'Ladrillo', color: '#b5583a', terrain: 'Colina' },
  lana: { label: 'Lana', color: '#7da33c', terrain: 'Pradera' },
  trigo: { label: 'Trigo', color: '#c99a22', terrain: 'Campo' },
  piedra: { label: 'Piedra', color: '#7d848c', terrain: 'Montaña' },
};

export const ICONS = {
  madera: svg(`
    <g stroke="#3b2414" stroke-width="1.5">
      <rect x="6" y="26" width="30" height="12" rx="6" fill="#8a5a34"/>
      <rect x="12" y="14" width="30" height="12" rx="6" fill="#9c6a3e"/>
      <ellipse cx="36" cy="32" rx="4.5" ry="6" fill="#d9b382"/>
      <ellipse cx="42" cy="20" rx="4.5" ry="6" fill="#e3c093"/>
      <ellipse cx="36" cy="32" rx="2" ry="3" fill="none"/>
      <ellipse cx="42" cy="20" rx="2" ry="3" fill="none"/>
    </g>`),
  ladrillo: svg(`
    <g stroke="#5a2414" stroke-width="1.5" fill="#c4633f">
      <rect x="5" y="28" width="18" height="10" rx="1.5"/>
      <rect x="25" y="28" width="18" height="10" rx="1.5" fill="#b5553a"/>
      <rect x="14" y="17" width="20" height="10" rx="1.5" fill="#d07a52"/>
      <rect x="20" y="7" width="14" height="9" rx="1.5" fill="#bf5d3b"/>
    </g>`),
  lana: svg(`
    <g stroke="#4a4338" stroke-width="1.5" stroke-linejoin="round">
      <rect x="15" y="31" width="4" height="10" rx="1.5" fill="#3a332b"/>
      <rect x="27" y="31" width="4" height="10" rx="1.5" fill="#3a332b"/>
      <path d="M11 30 C5 29 5 20 11 19 C11 12 20 10 23 15 C27 10 36 12 36 19 C42 20 42 29 36 30 C34 36 26 36 23 32 C20 36 13 36 11 30Z" fill="#f6f1e4"/>
      <ellipse cx="38" cy="20" rx="5" ry="6.5" fill="#3a332b"/>
      <circle cx="39.5" cy="18.5" r="1.1" fill="#f6f1e4" stroke="none"/>
    </g>`),
  trigo: svg(`
    <g stroke="#6b4a12" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M24 44 L24 16M24 44 C20 38 15 34 11 22M24 44 C28 38 33 34 37 22" fill="none"/>
      <g fill="#e9bf3f">
        <ellipse cx="24" cy="10" rx="3.2" ry="6"/>
        <ellipse cx="19.5" cy="19" rx="2.8" ry="5" transform="rotate(-28 19.5 19)"/>
        <ellipse cx="28.5" cy="19" rx="2.8" ry="5" transform="rotate(28 28.5 19)"/>
        <ellipse cx="10" cy="17" rx="2.8" ry="5.5" transform="rotate(-18 10 17)"/>
        <ellipse cx="38" cy="17" rx="2.8" ry="5.5" transform="rotate(18 38 17)"/>
      </g>
    </g>`),
  piedra: svg(`
    <g stroke="#3a3f45" stroke-width="1.5" stroke-linejoin="round">
      <path d="M5 38 L10 22 L21 16 L30 24 L32 38Z" fill="#8c939b"/>
      <path d="M24 38 L28 26 L37 21 L44 30 L43 38Z" fill="#a4abb3"/>
      <path d="M10 22 L18 26 L21 16M18 26 L20 38" fill="none"/>
      <path d="M28 26 L35 30 L37 21M35 30 L36 38" fill="none"/>
    </g>`),
  any: svg(`
    <g stroke="#3b2414" stroke-width="1.5">
      <circle cx="24" cy="24" r="15" fill="#e9dcb8"/>
      <text x="24" y="31" font-size="20" text-anchor="middle" font-family="Georgia,serif" fill="#3b2414" stroke="none">?</text>
    </g>`),
};

export const CARD_INFO = {
  baqueano: { label: 'Caballero', text: 'Mové el ladrón y robale una carta a un jugador con pueblo o ciudad en ese terreno. Con 3 o más tenés el Ejército más grande.' },
  picada: { label: 'Construcción de carreteras', text: 'Construí 2 carreteras gratis.' },
  cosecha: { label: 'Descubrimiento', text: 'Tomá 2 recursos del banco, los que quieras.' },
  feria: { label: 'Monopolio', text: 'Elegí un recurso: todos los jugadores te dan todas las cartas que tengan de ese recurso.' },
  fiesta: { label: 'Punto de victoria', text: 'Vale 1 punto. Queda oculta y se cuenta sola.' },
};

// Íconos de la interfaz (rivales, cartas, chat).
const ui = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const UI = {
  vp: ui('<path d="M12 3l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.4 6.7 19.3l1.1-5.9L3.4 9.3l6-.8z" fill="currentColor" stroke="none"/>'),
  cards: ui('<rect x="4" y="5" width="11" height="15" rx="2" fill="currentColor" fill-opacity=".25"/><rect x="9" y="3" width="11" height="15" rx="2" fill="currentColor" fill-opacity=".55"/>'),
  dev: ui('<rect x="5" y="3" width="14" height="18" rx="2" fill="currentColor" fill-opacity=".3"/><path d="M12 7v10M8.5 10.5L12 7l3.5 3.5"/>'),
  knight: ui('<path d="M6 21h12M8 21l1-5h6l1 5M9 16c-1-3 0-7 3-10 2 1 4 3 4 6l-2 1-1-2-2 2"/><circle cx="13.5" cy="9" r=".8" fill="currentColor"/>'),
  road: ui('<path d="M4 19L10 5M20 19L14 5M12 8v2M12 13v2M12 18v1"/>'),
  chat: ui('<path d="M4 5h16v11H9l-5 4z" fill="currentColor" fill-opacity=".2"/>'),
  bank: ui('<path d="M3 9l9-5 9 5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>'),
  send: ui('<path d="M4 12l16-8-6 16-2-7z" fill="currentColor" fill-opacity=".3"/>'),
  check: ui('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  cross: ui('<path d="M6 6l12 12M18 6L6 18"/>'),
  trade: ui('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
  pause: ui('<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>'),
  play: ui('<path d="M7 5l12 7-12 7z" fill="currentColor"/>'),
  bell: ui('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" fill="currentColor" fill-opacity=".25"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  friends: ui('<circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 13.6c2.8.2 5 2 5 4.9"/>'),
  user: ui('<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.8 3.1-6.3 7-6.3s7 2.5 7 6.3"/>'),
  gear: ui('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
};

export const iconUrl = (name) => `data:image/svg+xml;utf8,${encodeURIComponent(ICONS[name])}`;

// Ilustraciones de las cartas de desarrollo.
const art = (bg, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="${bg}"/>${body}</svg>`;
export const DEV_ART = {
  baqueano: art('#3a4f7a', `
    <path d="M32 10c-9 0-15 6-15 15v9h30v-9c0-9-6-15-15-15z" fill="#c9ccd2" stroke="#2a2f38" stroke-width="2"/>
    <path d="M17 34h30v4c0 3-2 5-5 5H22c-3 0-5-2-5-5z" fill="#a9adb5" stroke="#2a2f38" stroke-width="2"/>
    <rect x="22" y="24" width="20" height="4" rx="2" fill="#2a2f38"/>
    <path d="M32 10v14" stroke="#2a2f38" stroke-width="2"/>
    <path d="M32 6c4 0 8 2 9 5-3-1-6-1-9-1z" fill="#c8402f"/>
    <path d="M14 56l14-14M28 42l-3-3M28 42l3 3" stroke="#e8d9a8" stroke-width="3" stroke-linecap="round"/>
    <path d="M50 56L36 42" stroke="#e8d9a8" stroke-width="3" stroke-linecap="round"/>`),
  picada: art('#6b4a2c', `
    <path d="M8 50L28 14" stroke="#e3b866" stroke-width="7" stroke-linecap="round"/>
    <path d="M30 54L52 18" stroke="#e3b866" stroke-width="7" stroke-linecap="round"/>
    <path d="M8 50L28 14M30 54L52 18" stroke="#8a5a2c" stroke-width="1.5" stroke-dasharray="3 4"/>
    <circle cx="48" cy="46" r="9" fill="#2f6a2c"/><rect x="47" y="50" width="2.5" height="8" fill="#5a3c22"/>
    <path d="M14 22l4-6 4 6z" fill="#f6ecd2"/>`),
  cosecha: art('#4f7a3a', `
    <path d="M14 46c0-12 8-22 18-22s18 10 18 22z" fill="#a5672f" stroke="#5a3418" stroke-width="2"/>
    <path d="M14 46h36v4c0 3-2 5-5 5H19c-3 0-5-2-5-5z" fill="#8a5426" stroke="#5a3418" stroke-width="2"/>
    <ellipse cx="25" cy="24" rx="5" ry="7" fill="#e9bf3f"/><ellipse cx="33" cy="20" rx="5" ry="8" fill="#f3cf5a"/>
    <circle cx="41" cy="25" r="6" fill="#f6f1e4"/><rect x="28" y="26" width="9" height="6" rx="1" fill="#c4633f"/>
    <path d="M32 6l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z" fill="#ffe7a6"/>`),
  feria: art('#7a3a4f', `
    <ellipse cx="32" cy="48" rx="17" ry="5" fill="#b9822f"/><rect x="15" y="40" width="34" height="8" fill="#e3b866"/>
    <ellipse cx="32" cy="40" rx="17" ry="5" fill="#f3cf7a" stroke="#8a5a1c" stroke-width="1.5"/>
    <rect x="15" y="30" width="34" height="10" fill="#e3b866"/><ellipse cx="32" cy="30" rx="17" ry="5" fill="#ffe7a6" stroke="#8a5a1c" stroke-width="1.5"/>
    <text x="32" y="34" text-anchor="middle" font-family="Georgia,serif" font-weight="bold" font-size="9" fill="#8a5a1c">M</text>
    <path d="M10 18c6-4 10 2 16-2M38 16c6 4 10-2 16 2" stroke="#f6ecd2" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M26 14l6-6 6 6" stroke="#f6ecd2" stroke-width="2.5" fill="none" stroke-linecap="round"/>`),
  fiesta: art('#8a6a1c', `
    <path d="M20 10h24v10c0 9-5 15-12 15s-12-6-12-15z" fill="#ffd36b" stroke="#6b4a12" stroke-width="2"/>
    <path d="M20 14h-6c0 7 3 11 8 12M44 14h6c0 7-3 11-8 12" stroke="#6b4a12" stroke-width="2.5" fill="none"/>
    <rect x="29" y="35" width="6" height="8" fill="#e3b866" stroke="#6b4a12" stroke-width="1.5"/>
    <rect x="21" y="43" width="22" height="7" rx="2" fill="#a5672f" stroke="#6b4a12" stroke-width="1.5"/>
    <path d="M32 15l2 4 4.5.6-3.3 3 .8 4.4-4-2.1-4 2.1.8-4.4-3.3-3 4.5-.6z" fill="#fff6d6"/>
    <text x="32" y="59" text-anchor="middle" font-family="Georgia,serif" font-weight="bold" font-size="8" fill="#fff6d6">+1</text>`),
};

// Piezas en miniatura para la crónica.
export const PIECE_ICON = {
  settlement: `<svg viewBox="0 0 24 24"><path d="M4 21V11l8-7 8 7v10z" fill="currentColor" stroke="#0006" stroke-width="1.2"/></svg>`,
  city: `<svg viewBox="0 0 24 24"><path d="M2 21v-8l6-5 6 5v8zM14 21V7l4-4 4 4v14z" fill="currentColor" stroke="#0006" stroke-width="1.2"/></svg>`,
  road: `<svg viewBox="0 0 24 24"><rect x="2" y="9" width="20" height="6" rx="2" transform="rotate(-25 12 12)" fill="currentColor" stroke="#0006" stroke-width="1.2"/></svg>`,
  robber: `<svg viewBox="0 0 24 24"><path d="M7 21h10l-2-4h-6zM9.5 17l1-6h3l1 6z" fill="#4a4d52"/><circle cx="12" cy="7.5" r="3.5" fill="#4a4d52"/></svg>`,
  dice: `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4" fill="#f6f0e2" stroke="#231a14" stroke-width="1.5"/><circle cx="8" cy="8" r="1.6" fill="#231a14"/><circle cx="12" cy="12" r="1.6" fill="#231a14"/><circle cx="16" cy="16" r="1.6" fill="#231a14"/></svg>`,
};

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
  baqueano: { label: 'Baqueano', text: 'Mové el yaguareté y quitale una carta a un vecino.' },
  picada: { label: 'Picada', text: 'Abrí 2 caminos gratis.' },
  cosecha: { label: 'Cosecha', text: 'Tomá 2 recursos a elección.' },
  feria: { label: 'Feria', text: 'Elegí un recurso: todos te entregan los que tengan.' },
  fiesta: { label: 'Fiesta patronal', text: 'Vale 1 punto. Se cuenta sola.' },
};

export const iconUrl = (name) => `data:image/svg+xml;utf8,${encodeURIComponent(ICONS[name])}`;

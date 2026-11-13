// Íconos propios, dibujados en SVG.

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">${body}</svg>`;

export const RES_INFO = {
  madera: { label: 'Madera', color: '#5b7a3a', terrain: 'Monte' },
  arcilla: { label: 'Arcilla', color: '#b5583a', terrain: 'Barranca' },
  yerba: { label: 'Yerba', color: '#86a83f', terrain: 'Yerbal' },
  pescado: { label: 'Pescado', color: '#3f86a8', terrain: 'Laguna' },
  piedra: { label: 'Piedra', color: '#7d848c', terrain: 'Cantera' },
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
  arcilla: svg(`
    <g stroke="#5a2414" stroke-width="1.5" fill="#c4633f">
      <rect x="5" y="28" width="18" height="10" rx="1.5"/>
      <rect x="25" y="28" width="18" height="10" rx="1.5" fill="#b5553a"/>
      <rect x="14" y="17" width="20" height="10" rx="1.5" fill="#d07a52"/>
      <rect x="20" y="7" width="14" height="9" rx="1.5" fill="#bf5d3b"/>
    </g>`),
  yerba: svg(`
    <g stroke="#2f4a1b" stroke-width="1.5" stroke-linecap="round">
      <path d="M24 42 C24 30 24 22 24 12" fill="none"/>
      <path d="M24 30 C14 30 8 23 8 14 C18 14 24 20 24 30Z" fill="#7fae3d"/>
      <path d="M24 24 C34 24 41 17 41 8 C31 8 24 14 24 24Z" fill="#9cc64f"/>
      <path d="M24 40 C31 40 36 36 37 30 C30 30 25 33 24 40Z" fill="#6c9a33"/>
    </g>`),
  pescado: svg(`
    <g stroke="#1d4257" stroke-width="1.5" stroke-linejoin="round">
      <path d="M5 24 C12 12 26 11 35 24 C26 37 12 36 5 24Z" fill="#6fb3cf"/>
      <path d="M33 24 L44 14 L41 24 L44 34Z" fill="#4f95b3"/>
      <path d="M17 15 C20 20 20 28 17 33" fill="none"/>
      <circle cx="11.5" cy="22" r="1.8" fill="#1d4257" stroke="none"/>
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

// Cuentas, sesiones y amigos. Se guardan en un archivo JSON dentro de DATA_DIR
// (en Docker, un volumen), así sobreviven a reinicios y deploys.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_TOKENS = 10;
const NAME_RE = /^[A-Za-z0-9_.-]{3,16}$/;

export function createStore(dir) {
  const file = path.join(dir, 'accounts.json');
  let data = { users: {} };
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.users) data = { users: {} };
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('No se pudo leer accounts.json:', e.message);
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 200);
  }
  function flush() {
    clearTimeout(saveTimer);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, file); // escritura atómica: nunca queda un archivo a medias
    } catch (e) {
      console.error('No se pudo guardar accounts.json:', e.message);
    }
  }

  const key = (name) => String(name || '').trim().toLowerCase();
  const get = (name) => data.users[key(name)] || null;
  const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
  const hashPass = (pass, salt) => crypto.scryptSync(pass, salt, 64).toString('hex');

  function newToken(u) {
    const token = crypto.randomBytes(32).toString('hex');
    u.tokens = [{ h: sha(token), at: Date.now() }, ...(u.tokens || [])].slice(0, MAX_TOKENS);
    save();
    return token;
  }

  return {
    flush,
    exists: (name) => !!get(name),
    displayName: (name) => get(name)?.name || null,

    register(name, pass) {
      name = String(name || '').trim();
      pass = String(pass || '');
      if (!NAME_RE.test(name)) return { error: 'El usuario tiene que tener de 3 a 16 letras, números, punto, guion o guion bajo.' };
      if (pass.length < 6 || pass.length > 100) return { error: 'La contraseña tiene que tener al menos 6 caracteres.' };
      if (get(name)) return { error: 'Ese usuario ya existe.' };
      const salt = crypto.randomBytes(16).toString('hex');
      const u = { name, salt, hash: hashPass(pass, salt), created: Date.now(), friends: [], incoming: [], outgoing: [], tokens: [] };
      data.users[key(name)] = u;
      return { user: name, token: newToken(u) };
    },

    login(name, pass) {
      const u = get(name);
      if (!u) return { error: 'Usuario o contraseña incorrectos.' };
      const h = Buffer.from(hashPass(String(pass || ''), u.salt), 'hex');
      if (!crypto.timingSafeEqual(h, Buffer.from(u.hash, 'hex'))) return { error: 'Usuario o contraseña incorrectos.' };
      return { user: u.name, token: newToken(u) };
    },

    resume(token) {
      const h = sha(String(token || ''));
      for (const u of Object.values(data.users)) if ((u.tokens || []).some((t) => t.h === h)) return u.name;
      return null;
    },

    logout(token) {
      const h = sha(String(token || ''));
      for (const u of Object.values(data.users)) {
        const before = (u.tokens || []).length;
        u.tokens = (u.tokens || []).filter((t) => t.h !== h);
        if (u.tokens.length !== before) save();
      }
    },

    social(name) {
      const u = get(name);
      return u ? { friends: [...u.friends], incoming: [...u.incoming], outgoing: [...u.outgoing] } : null;
    },

    // Devuelve qué pasó: 'sent', 'accepted' (si el otro ya te había mandado) o un error.
    request(from, to) {
      const a = get(from);
      const b = get(to);
      if (!a || !b) return { error: 'Ese usuario no existe.' };
      if (a === b) return { error: 'No podés agregarte a vos mismo.' };
      if (a.friends.includes(b.name)) return { error: `Ya son amigos con ${b.name}.` };
      if (a.incoming.includes(b.name)) return this.respond(a.name, b.name, true);
      if (a.outgoing.includes(b.name)) return { error: 'Ya le mandaste una solicitud.' };
      a.outgoing.push(b.name);
      b.incoming.push(a.name);
      save();
      return { ok: 'sent', other: b.name };
    },

    respond(me, other, accept) {
      const a = get(me);
      const b = get(other);
      if (!a || !b || !a.incoming.includes(b.name)) return { error: 'No hay solicitud de ese usuario.' };
      a.incoming = a.incoming.filter((n) => n !== b.name);
      b.outgoing = b.outgoing.filter((n) => n !== a.name);
      if (accept) {
        if (!a.friends.includes(b.name)) a.friends.push(b.name);
        if (!b.friends.includes(a.name)) b.friends.push(a.name);
      }
      save();
      return { ok: accept ? 'accepted' : 'declined', other: b.name };
    },

    unfriend(me, other) {
      const a = get(me);
      const b = get(other);
      if (!a || !b) return { error: 'Ese usuario no existe.' };
      a.friends = a.friends.filter((n) => n !== b.name);
      b.friends = b.friends.filter((n) => n !== a.name);
      a.outgoing = a.outgoing.filter((n) => n !== b.name);
      b.incoming = b.incoming.filter((n) => n !== a.name);
      save();
      return { ok: 'removed', other: b.name };
    },

    areFriends: (a, b) => !!get(a)?.friends.includes(get(b)?.name),
  };
}

// Base de datos: Upstash Redis por REST (se conecta desde Vercel > Storage). Sin variables, en local usa memoria.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const mem = new Map();

function memCmd([c, ...a]) {
  c = c.toUpperCase();
  const k = a[0];
  if (c === 'GET') return mem.has(k) ? mem.get(k) : null;
  if (c === 'SET') { mem.set(k, a[1]); return 'OK'; }
  if (c === 'DEL') { mem.delete(k); return 1; }
  if (c === 'INCR') { const v = (Number(mem.get(k)) || 0) + 1; mem.set(k, String(v)); return v; }
  if (c === 'EXPIRE') return 1;
  if (c === 'HSET') { const h = mem.get(k) || {}; h[a[1]] = a[2]; mem.set(k, h); return 1; }
  if (c === 'HGETALL') { const h = mem.get(k) || {}; return Object.entries(h).flat(); }
  if (c === 'LPUSH') { const l = mem.get(k) || []; l.unshift(a[1]); mem.set(k, l); return l.length; }
  if (c === 'LRANGE') { const l = mem.get(k) || []; return l.slice(Number(a[1]), Number(a[2]) + 1); }
  if (c === 'LTRIM') { const l = mem.get(k) || []; mem.set(k, l.slice(Number(a[1]), Number(a[2]) + 1)); return 'OK'; }
  throw new Error('comando no soportado: ' + c);
}

export async function cmd(...args) {
  if (!URL_) {
    if (process.env.VERCEL) throw new Error('Falta conectar la base de datos (Upstash Redis) en Vercel > Storage.');
    return memCmd(args);
  }
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(args) });
  const j = await r.json();
  if (j.error) throw new Error('Base de datos: ' + j.error);
  return j.result;
}
export const getJSON = async (k) => { const v = await cmd('GET', k); return v ? JSON.parse(v) : null; };
export const setJSON = (k, v) => cmd('SET', k, JSON.stringify(v));
export async function hgetall(k) {
  const flat = (await cmd('HGETALL', k)) || [];
  const o = {};
  for (let i = 0; i < flat.length; i += 2) o[flat[i]] = JSON.parse(flat[i + 1]);
  return o;
}
export const hsetJSON = (k, f, v) => cmd('HSET', k, f, JSON.stringify(v));
export async function logEvent(ev) {
  await cmd('LPUSH', 'log', JSON.stringify({ at: new Date().toISOString(), ...ev }));
  await cmd('LTRIM', 'log', 0, 4999);
}
export async function getLog(n = 100) {
  return ((await cmd('LRANGE', 'log', 0, n - 1)) || []).map((x) => JSON.parse(x));
}

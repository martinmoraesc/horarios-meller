import crypto from 'node:crypto';
import { cmd, getJSON, setJSON } from './db.js';
import { DEFAULT_CFG } from './defaults.js';

const SECRET = process.env.APP_SECRET || 'dev-secret-cambiar';
const b64 = (b) => Buffer.from(b).toString('base64url');
const mac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

export const hashPin = (name, pin) => crypto.createHash('sha256').update(`${SECRET}:${name}:${pin}`).digest('hex');
export function sign(payload, days = 45) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + days * 864e5 }));
  return body + '.' + mac(body);
}
export function verify(tok) {
  if (!tok || !tok.includes('.')) return null;
  const [body, sig] = tok.split('.');
  const good = mac(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp > Date.now() ? p : null;
}
export function authOf(req) {
  const h = req.headers.authorization || '';
  return verify(h.startsWith('Bearer ') ? h.slice(7) : req.query?.token);
}
export async function getCfg() {
  let cfg = await getJSON('cfg');
  if (!cfg) { cfg = { ...DEFAULT_CFG, pins: {} }; await setJSON('cfg', cfg); }
  return cfg;
}
export const publicCfg = (cfg) => { const { pins, adminHash, teamHash, ...rest } = cfg; return rest; };
export const adminHashOf = (pin) => hashPin('__admin__', String(pin));
export const validAdminPin = (p) => typeof p === 'string' && p.length >= 6 && p.length <= 64;
export const validStaffPin = (p) => /^\d{4}$/.test(String(p));
export const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
export async function throttle(key) {
  const n = await cmd('INCR', 'fail:' + key);
  if (n === 1) await cmd('EXPIRE', 'fail:' + key, 900);
  return n;
}
export const clearThrottle = (key) => cmd('DEL', 'fail:' + key);
export const json = (res, code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(obj)); };
export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

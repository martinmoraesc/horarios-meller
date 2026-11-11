import crypto from 'node:crypto';
import { authOf, getCfg, hashPin, safeEq, throttle, clearThrottle, json, body } from '../lib/auth.js';
import { hgetall, hsetJSON, logEvent } from '../lib/db.js';
import { mondayOf, todayUY, addDays, isMonday } from '../public/rules.js';

// Horas extra: se registran desde la solapa Hoy (cada uno con su sesión, o en la pantalla general con nombre + PIN)
// y Martín las aprueba o rechaza desde el panel.
const okTime = (v) => typeof v === 'number' && v >= 0 && v <= 24 && Math.abs(v * 2 - Math.round(v * 2)) < 1e-9;
const isoOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export default async function handler(req, res) {
  try {
    const me = authOf(req);
    if (!me) return json(res, 401, { error: 'Sesión vencida' });
    const cfg = await getCfg();
    if (req.method === 'GET') {
      const week = req.query?.week || mondayOf(todayUY());
      if (!isMonday(week)) return json(res, 400, { error: 'Semana inválida' });
      const all = Object.values(await hgetall('extra:' + week)).sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from));
      const list = me.role === 'admin' ? all : me.role === 'staff' ? all.filter((x) => x.name === me.name) : all.filter((x) => x.date === (req.query?.date || todayUY())).map(({ reason, ...x }) => x);
      return json(res, 200, { week, extras: list });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' });
    const b = await body(req);
    const key = (date) => 'extra:' + mondayOf(date);

    if (b.action === 'status') {
      if (me.role !== 'admin') return json(res, 403, { error: 'Solo para el administrador' });
      if (!['pendiente', 'aprobada', 'rechazada'].includes(b.status) || !isoOk(b.date)) return json(res, 400, { error: 'Datos inválidos' });
      const all = await hgetall(key(b.date));
      const x = all[b.id];
      if (!x) return json(res, 404, { error: 'No existe ese registro' });
      x.status = b.status; x.reviewedAt = new Date().toISOString();
      await hsetJSON(key(b.date), x.id, x);
      await logEvent({ type: 'extra-' + b.status, name: x.name, by: me.name, week: mondayOf(x.date), extra: { date: x.date, from: x.from, to: x.to } });
      return json(res, 200, { ok: true, extra: x });
    }

    // Alta de horas extra
    let name = me.role === 'staff' ? me.name : String(b.name || '');
    if (!cfg.people[name]) return json(res, 404, { error: 'Elegí quién sos.' });
    if (me.role === 'team') {
      if ((await throttle('x:' + name)) > 8) return json(res, 429, { error: 'Demasiados intentos. Probá en 15 minutos.' });
      if (!cfg.pins[name] || !safeEq(hashPin(name, String(b.pin || '')), cfg.pins[name])) return json(res, 403, { error: 'PIN incorrecto.' });
      await clearThrottle('x:' + name);
    }
    const today = todayUY();
    if (!isoOk(b.date) || b.date > today || b.date < addDays(today, -14)) return json(res, 400, { error: 'La fecha tiene que ser de las últimas dos semanas (no futura).' });
    if (!okTime(b.from) || !okTime(b.to) || b.to <= b.from) return json(res, 400, { error: 'Revisá la hora de inicio y de fin.' });
    if (b.to - b.from > 12) return json(res, 400, { error: 'No puede ser más de 12 horas.' });
    const reason = String(b.reason || '').trim().slice(0, 200);
    if (!reason) return json(res, 400, { error: 'Contá brevemente por qué (por ejemplo: cubrí a alguien, mucha gente, inventario).' });
    const loc = cfg.people[name].locs.includes(b.loc) ? b.loc : cfg.people[name].locs[0];
    const x = { id: crypto.randomUUID(), name, loc, date: b.date, from: b.from, to: b.to, hours: b.to - b.from, reason, status: 'pendiente', createdAt: new Date().toISOString(), by: me.role === 'team' ? 'pantalla general' : me.name };
    await hsetJSON(key(b.date), x.id, x);
    await logEvent({ type: 'extra', name, by: x.by, week: mondayOf(b.date), extra: { date: x.date, from: x.from, to: x.to } });
    json(res, 200, { ok: true, extra: x });
  } catch (e) { json(res, 400, { error: e.message }); }
}

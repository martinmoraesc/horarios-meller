import { authOf, getCfg, json, body } from '../lib/auth.js';
import { hgetall, hsetJSON, logEvent } from '../lib/db.js';
import { isMonday, addDays, checkConfirm, personalErrors } from '../public/rules.js';

const okTime = (v) => typeof v === 'number' && v >= 0 && v <= 24 && Math.abs(v * 2 - Math.round(v * 2)) < 1e-9;
export function cleanDays(days) {
  if (!Array.isArray(days) || days.length !== 7) throw new Error('Semana inválida');
  return days.map((s) => {
    if (!s) return null;
    if (!Array.isArray(s) || !okTime(s[0]) || !okTime(s[1]) || s[1] <= s[0]) throw new Error('Horario inválido');
    return [s[0], s[1]];
  });
}

export default async function handler(req, res) {
  try {
    const me = authOf(req);
    if (!me) return json(res, 401, { error: 'Sesión vencida' });
    if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' });
    const b = await body(req);
    const name = me.role === 'admin' && b.name ? b.name : me.name;
    const cfg = await getCfg();
    if (!cfg.people[name]) return json(res, 404, { error: 'Persona inexistente' });
    if (!isMonday(b.week)) return json(res, 400, { error: 'La semana tiene que empezar un lunes.' });
    const loc = b.entry?.loc;
    if (!cfg.people[name].locs.includes(loc)) return json(res, 400, { error: 'Ese local no está en tu lista.' });
    const days = cleanDays(b.entry.days);
    const entries = await hgetall('week:' + b.week);
    const old = entries[name];
    if (old && old.status === 'locked' && me.role !== 'admin') return json(res, 423, { error: 'Tu semana está cerrada. Pedile a Martín que la reabra.' });
    const prev = await hgetall('week:' + addDays(b.week, -7));
    const prevSunday = prev[name]?.days?.[6] || null;
    const entry = { loc, days, status: 'draft', forced: false, updatedAt: new Date().toISOString(), confirmedAt: old?.confirmedAt || null };
    delete entries[name];
    if (b.status === 'confirmed') {
      const chk = checkConfirm(cfg, name, entry, entries, prevSunday, b.week);
      const hard = chk.errors.length && !chk.blockedByCoverage;
      if (hard) return json(res, 422, { ok: false, errors: chk.errors });
      if (!chk.ok && !b.force) return json(res, 422, { ok: false, errors: chk.errors, suggestion: chk.suggestion, canForce: true });
      entry.status = 'confirmed';
      entry.forced = !chk.ok;
      entry.confirmedAt = entry.updatedAt;
    }
    await hsetJSON('week:' + b.week, name, entry);
    await logEvent({ type: entry.status, name, by: me.name, week: b.week, loc, days, forced: entry.forced });
    json(res, 200, { ok: true, entry });
  } catch (e) { json(res, 400, { error: e.message }); }
}

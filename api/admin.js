import crypto from 'node:crypto';
import { authOf, getCfg, publicCfg, hashPin, json, body, adminHashOf, validAdminPin, validStaffPin } from '../lib/auth.js';
import { cmd, setJSON, hgetall, hsetJSON, getLog, logEvent } from '../lib/db.js';
import { weekSummary, weekCsv, sendMail } from '../lib/mail.js';
import { isMonday, addDays } from '../public/rules.js';

const timeRows = (rows) => Array.isArray(rows) && rows.every((r) => Array.isArray(r) && r.length === 3 && r.slice(0, 2).every((x) => typeof x === 'number') && typeof r[2] === 'number');
function validDay(t) {
  if (!t) return true;
  return typeof t.open === 'number' && typeof t.close === 'number' && t.open < t.close && t.close <= 24 && timeRows(t.mn) && timeRows(t.ideal || []);
}
export function validateCfg(c) {
  if (!c || typeof c !== 'object') throw new Error('Configuración inválida');
  if (!c.periods?.every((p) => p.id && c.locs[p.loc] && /^\d{4}-\d\d-\d\d$/.test(p.from) && /^\d{4}-\d\d-\d\d$/.test(p.to) && p.from <= p.to && validDay(p.weekday) && validDay(p.weekend))) throw new Error('Alguna etapa tiene datos inválidos.');
  for (const [n, p] of Object.entries(c.people)) {
    if (!n.trim() || !Array.isArray(p.locs) || !p.locs.every((l) => c.locs[l]) || typeof p.hours !== 'number' || p.hours < 0 || p.hours > 60) throw new Error(`Datos inválidos para ${n}.`);
  }
  const r = c.rules;
  if (!r || !['minRest', 'maxDay', 'minShift', 'maxDays', 'minWeekendDays'].every((k) => typeof r[k] === 'number')) throw new Error('Reglas inválidas.');
}

export default async function handler(req, res) {
  try {
    const me = authOf(req);
    if (!me || me.role !== 'admin') return json(res, 403, { error: 'Solo para el administrador' });
    const b = req.method === 'POST' ? await body(req) : req.query || {};
    const cfg = await getCfg();
    switch (b.action) {
      case 'cfg': return json(res, 200, { cfg: publicCfg(cfg), hasPin: Object.fromEntries(Object.keys(cfg.people).map((n) => [n, !!cfg.pins[n]])) });
      case 'saveCfg': {
        const next = { ...b.cfg, pins: cfg.pins, adminHash: cfg.adminHash };
        validateCfg(next);
        for (const n of Object.keys(next.pins)) if (!next.people[n]) delete next.pins[n];
        await setJSON('cfg', next);
        await logEvent({ type: 'cfg', by: me.name });
        return json(res, 200, { ok: true });
      }
      case 'setAdminPin': {
        if (!validAdminPin(b.pin)) return json(res, 400, { error: 'La clave tiene que tener al menos 6 caracteres.' });
        cfg.adminHash = adminHashOf(b.pin);
        await setJSON('cfg', cfg);
        await logEvent({ type: 'admin-pin', by: me.name });
        return json(res, 200, { ok: true });
      }
      case 'genPin': {
        if (!cfg.people[b.name]) return json(res, 404, { error: 'No existe' });
        if (b.pin !== undefined && !validStaffPin(b.pin)) return json(res, 400, { error: 'El PIN tiene que ser de 4 números.' });
        const pin = b.pin !== undefined ? String(b.pin) : String(crypto.randomInt(0, 10000)).padStart(4, '0');
        cfg.pins[b.name] = hashPin(b.name, pin);
        await setJSON('cfg', cfg);
        await logEvent({ type: 'pin', name: b.name, by: me.name });
        return json(res, 200, { pin });
      }
      case 'setStatus': {
        if (!isMonday(b.week) || !['draft', 'confirmed', 'locked'].includes(b.status)) return json(res, 400, { error: 'Datos inválidos' });
        const entries = await hgetall('week:' + b.week);
        const e = entries[b.name];
        if (!e) return json(res, 404, { error: 'Esa persona no cargó nada' });
        e.status = b.status;
        await hsetJSON('week:' + b.week, b.name, e);
        await logEvent({ type: b.status, name: b.name, by: me.name, week: b.week });
        return json(res, 200, { ok: true });
      }
      case 'log': return json(res, 200, { log: await getLog(150) });
      case 'sendMail': {
        if (!isMonday(b.week)) return json(res, 400, { error: 'Semana inválida' });
        const entries = await hgetall('week:' + b.week);
        const s = weekSummary(cfg, b.week, entries);
        await sendMail({ subject: `Horarios semana del ${b.week.slice(8)}/${b.week.slice(5, 7)}`, html: s.html, text: s.text, csv: weekCsv(cfg, b.week, entries), csvName: `horarios-${b.week}.csv` });
        return json(res, 200, { ok: true });
      }
      default: return json(res, 400, { error: 'Acción desconocida' });
    }
  } catch (e) { json(res, 400, { error: e.message }); }
}

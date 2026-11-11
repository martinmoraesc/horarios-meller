import { getCfg, json, safeEq } from '../lib/auth.js';
import { hgetall, setJSON, logEvent } from '../lib/db.js';
import { weekSummary, weekCsv, sendMail } from '../lib/mail.js';
import { addDays, mondayOf, todayUY } from '../public/rules.js';

// Jueves: estado de la semana que viene. Domingo: archiva la semana que termina y manda el resumen.
export default async function handler(req, res) {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.authorization || '';
    if (!secret || !safeEq(auth, 'Bearer ' + secret)) return json(res, 401, { error: 'No autorizado' });
    const kind = req.query?.kind === 'archive' ? 'archive' : 'remind';
    const cfg = await getCfg();
    const thisMon = mondayOf(todayUY());
    const week = kind === 'archive' ? thisMon : addDays(thisMon, 7);
    const entries = await hgetall('week:' + week);
    const extras = Object.values(await hgetall('extra:' + week));
    if (kind === 'archive') await setJSON('archive:' + week, { savedAt: new Date().toISOString(), entries, extras });
    const nextWeek = addDays(week, 7);
    const s = weekSummary(cfg, week, entries, extras);
    const subject = kind === 'archive' ? `Cierre de la semana del ${week.slice(8)}/${week.slice(5, 7)}` : `Semana que viene: ${s.missing.length} sin cargar, faltan ${s.gapH} h`;
    await sendMail({ subject, html: s.html, text: s.text, csv: weekCsv(cfg, week, entries, extras), csvName: `horarios-${week}.csv` });
    await logEvent({ type: 'cron-' + kind, week });
    json(res, 200, { ok: true, kind, week, nextWeek });
  } catch (e) { json(res, 500, { error: e.message }); }
}

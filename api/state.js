import { authOf, getCfg, publicCfg, json } from '../lib/auth.js';
import { hgetall } from '../lib/db.js';
import { isMonday, addDays, todayUY, mondayOf } from '../public/rules.js';

export default async function handler(req, res) {
  try {
    const me = authOf(req);
    if (!me) return json(res, 401, { error: 'Sesión vencida' });
    let week = req.query?.week || mondayOf(addDays(todayUY(), 7));
    if (!isMonday(week)) return json(res, 400, { error: 'La semana tiene que empezar un lunes.' });
    const cfg = await getCfg();
    const entries = await hgetall('week:' + week);
    const prev = await hgetall('week:' + addDays(week, -7));
    const prevSunday = {};
    for (const [n, e] of Object.entries(prev)) if (e.days && e.days[6]) prevSunday[n] = e.days[6];
    json(res, 200, { me, week, today: todayUY(), cfg: publicCfg(cfg), entries, prevSunday });
  } catch (e) { json(res, 500, { error: e.message }); }
}

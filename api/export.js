import { authOf, getCfg, json } from '../lib/auth.js';
import { hgetall } from '../lib/db.js';
import { weekCsv } from '../lib/mail.js';
import { isMonday } from '../public/rules.js';

export default async function handler(req, res) {
  try {
    const me = authOf(req);
    if (!me || me.role !== 'admin') return json(res, 403, { error: 'Solo para el administrador' });
    const week = req.query?.week;
    if (!isMonday(week)) return json(res, 400, { error: 'Semana inválida' });
    const csv = weekCsv(await getCfg(), week, await hgetall('week:' + week), Object.values(await hgetall('extra:' + week)));
    res.statusCode = 200;
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="horarios-${week}.csv"`);
    res.end('﻿' + csv);
  } catch (e) { json(res, 500, { error: e.message }); }
}

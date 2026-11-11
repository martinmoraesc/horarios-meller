import { authOf, getCfg, hashPin, safeEq, validStaffPin, throttle, json, body } from '../lib/auth.js';
import { setJSON, logEvent } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    const me = authOf(req);
    if (!me || me.role !== 'staff') return json(res, 403, { error: 'Solo para el equipo' });
    if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' });
    const b = await body(req);
    const cfg = await getCfg();
    if ((await throttle('chg:' + me.name)) > 8) return json(res, 429, { error: 'Demasiados intentos. Probá en 15 minutos.' });
    if (!cfg.pins[me.name] || !safeEq(hashPin(me.name, String(b.oldPin || '')), cfg.pins[me.name])) return json(res, 403, { error: 'El PIN actual no es correcto.' });
    if (!validStaffPin(b.newPin)) return json(res, 400, { error: 'El PIN nuevo tiene que ser de 4 números.' });
    cfg.pins[me.name] = hashPin(me.name, String(b.newPin));
    await setJSON('cfg', cfg);
    await logEvent({ type: 'pin', name: me.name, by: me.name });
    json(res, 200, { ok: true });
  } catch (e) { json(res, 400, { error: e.message }); }
}

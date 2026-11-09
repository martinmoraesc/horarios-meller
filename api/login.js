import { getCfg, hashPin, sign, safeEq, throttle, clearThrottle, json, body, publicCfg } from '../lib/auth.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' });
    const b = await body(req);
    const cfg = await getCfg();
    const pin = String(b.pin || '');
    if (b.admin) {
      if ((await throttle('admin')) > 8) return json(res, 429, { error: 'Demasiados intentos. Probá en 15 minutos.' });
      const ap = process.env.ADMIN_PIN;
      if (!ap) return json(res, 500, { error: 'Falta configurar ADMIN_PIN en Vercel.' });
      if (!safeEq(pin, ap)) return json(res, 401, { error: 'Clave incorrecta.' });
      await clearThrottle('admin');
      return json(res, 200, { token: sign({ role: 'admin', name: 'Martín' }), role: 'admin', name: 'Martín' });
    }
    const name = String(b.name || '');
    if (!cfg.people[name]) return json(res, 404, { error: 'No encontramos ese nombre.' });
    if ((await throttle(name)) > 8) return json(res, 429, { error: 'Demasiados intentos. Probá en 15 minutos.' });
    const stored = cfg.pins[name];
    if (!stored) return json(res, 403, { error: 'Todavía no tenés PIN. Pedíselo a Martín.' });
    if (!safeEq(hashPin(name, pin), stored)) return json(res, 401, { error: 'PIN incorrecto.' });
    await clearThrottle(name);
    return json(res, 200, { token: sign({ role: 'staff', name }), role: 'staff', name });
  } catch (e) { return json(res, 500, { error: e.message }); }
}

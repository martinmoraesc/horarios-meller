import { getCfg, hashPin, sign, safeEq, throttle, clearThrottle, json, body, adminHashOf, validAdminPin } from '../lib/auth.js';
import { setJSON, logEvent } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' });
    const b = await body(req);
    const cfg = await getCfg();
    const pin = String(b.pin || '');
    const envPin = process.env.ADMIN_PIN;
    if (b.setup) {
      // Primera vez: se crea la clave de administrador desde la web.
      if (cfg.adminHash || envPin) return json(res, 403, { error: 'La clave de administrador ya está creada.' });
      if (!validAdminPin(pin)) return json(res, 400, { error: 'La clave tiene que tener al menos 6 caracteres.' });
      if (pin !== String(b.pin2 || '')) return json(res, 400, { error: 'Las dos claves no coinciden.' });
      cfg.adminHash = adminHashOf(pin);
      await setJSON('cfg', cfg);
      await logEvent({ type: 'admin-setup', by: 'Martín' });
      return json(res, 200, { token: sign({ role: 'admin', name: 'Martín' }), role: 'admin', name: 'Martín' });
    }
    if (b.team) {
      // Pantalla general del local: sin código. Solo muestra el día y permite registrar horas extra con nombre + PIN.
      return json(res, 200, { token: sign({ role: 'team', name: 'Pantalla general' }, 120), role: 'team', name: 'Pantalla general' });
    }
    if (b.admin) {
      if (!cfg.adminHash && !envPin) return json(res, 409, { needsSetup: true, error: 'Todavía no creaste tu clave de administrador.' });
      if ((await throttle('admin')) > 8) return json(res, 429, { error: 'Demasiados intentos. Probá en 15 minutos.' });
      const ok = (cfg.adminHash && safeEq(adminHashOf(pin), cfg.adminHash)) || (envPin && safeEq(pin, envPin));
      if (!ok) return json(res, 401, { error: 'Clave incorrecta.' });
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

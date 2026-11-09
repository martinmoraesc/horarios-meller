import { getCfg, json } from '../lib/auth.js';
// Lista pública de nombres para la pantalla de ingreso (sin PIN ni datos).
export default async function handler(req, res) {
  try {
    const cfg = await getCfg();
    json(res, 200, { adminSet: !!(cfg.adminHash || process.env.ADMIN_PIN), names: Object.keys(cfg.people), hasPin: Object.fromEntries(Object.keys(cfg.people).map((n) => [n, !!cfg.pins[n]])) });
  } catch (e) { json(res, 500, { error: e.message }); }
}

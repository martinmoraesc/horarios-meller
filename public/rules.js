// Motor de reglas compartido: lo usan el navegador y el servidor.
// Horas en decimal (17.5 = 17:30). Cada día de una persona es null (libre) o [entra, sale].
export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const NS = 48; // medias horas por día

export const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dowOf = (iso) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7;
export const mondayOf = (iso) => addDays(iso, -dowOf(iso));
export const todayUY = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
export const isMonday = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && dowOf(iso) === 0;

export function fmt(h) {
  const H = Math.floor(h + 1e-9);
  const m = Math.round((h - H) * 60);
  return (H === 24 ? '00' : String(H)) + ':' + String(m).padStart(2, '0');
}
export const rng = (s) => fmt(s[0]) + '–' + fmt(s[1]);
export const hoursOf = (days) => days.reduce((a, d) => a + (d ? d[1] - d[0] : 0), 0);

export function periodFor(cfg, loc, iso) {
  return cfg.periods.find((p) => p.loc === loc && p.from <= iso && iso <= p.to) || null;
}

// Requisitos de un día: horario de apertura, mínimo por media hora y nivel ideal.
export function dayReq(cfg, loc, iso) {
  const p = periodFor(cfg, loc, iso);
  if (!p) return null;
  const t = dowOf(iso) >= 5 ? p.weekend : p.weekday;
  if (!t) return { closed: true, mn: new Array(NS).fill(0), ideal: new Array(NS).fill(0), open: 0, close: 0 };
  const mn = new Array(NS).fill(0);
  const ideal = new Array(NS).fill(0);
  for (const [a, b, n] of t.mn) for (let i = Math.round(a * 2); i < Math.round(b * 2); i++) mn[i] = n;
  for (const [a, b, n] of t.ideal || []) for (let i = Math.round(a * 2); i < Math.round(b * 2); i++) ideal[i] = n;
  for (let i = 0; i < NS; i++) ideal[i] = Math.max(ideal[i], mn[i]);
  return { open: t.open, close: t.close, mn, ideal, note: p.note || '' };
}
export const weekReq = (cfg, loc, week) => Array.from({ length: 7 }, (_, d) => dayReq(cfg, loc, addDays(week, d)));

// Cuántas personas hay en cada media hora del día `dow` en el local `loc`.
export function haveArr(entries, loc, dow, exclude) {
  const a = new Array(NS).fill(0);
  for (const [name, e] of Object.entries(entries || {})) {
    if (name === exclude || !e || e.loc !== loc) continue;
    const s = e.days && e.days[dow];
    if (!s) continue;
    for (let i = Math.round(s[0] * 2); i < Math.round(s[1] * 2) && i < NS; i++) a[i]++;
  }
  return a;
}

// Los fines de semana pesan el doble y la tardecita/noche una vez y media.
export const weight = (dow, i) => (dow >= 5 ? 2 : 1) * (i / 2 >= 17 ? 1.5 : 1);

// Faltantes agrupados: [{dow, from, to, missing}]
export function gapsOf(cfg, loc, week, entries) {
  const reqs = weekReq(cfg, loc, week);
  const out = [];
  reqs.forEach((r, d) => {
    if (!r || r.closed) return;
    const have = haveArr(entries, loc, d);
    let cur = null;
    for (let i = 0; i <= NS; i++) {
      const miss = i < NS ? Math.max(0, r.mn[i] - have[i]) : 0;
      if (cur && (miss !== cur.missing || i === NS)) { cur.to = i / 2; out.push(cur); cur = null; }
      if (!cur && miss > 0 && i < NS) cur = { dow: d, from: i / 2, to: 0, missing: miss };
    }
  });
  return out;
}
export const gapHours = (gaps) => gaps.reduce((a, g) => a + (g.to - g.from) * g.missing, 0);

// Días de la semana en que la persona ya está (o todavía está) en el equipo.
export function availDays(person, week) {
  return Array.from({ length: 7 }, (_, d) => {
    const iso = addDays(week, d);
    return !(person.from && iso < person.from) && !(person.to && iso > person.to);
  });
}
// Horas que le corresponden esa semana (proporcional si entra o sale a mitad de semana).
// Semanas sin día libre (temporada alta): la etapa que contiene el domingo trae noDayOff.
export function noDayOffWeek(cfg, loc, week) {
  if (!cfg || !loc) return false;
  const p = periodFor(cfg, loc, addDays(week, 6));
  return !!(p && p.noDayOff);
}
// Horas extra por trabajar el día libre: un turno promedio más (queda como descanso a compensar).
export const restDayHours = (person) => Math.round((person.hours / 6) * 2) / 2;
export function targetHours(person, week, cfg, loc) {
  const n = availDays(person, week).filter(Boolean).length;
  if (n >= 7) return person.hours + (noDayOffWeek(cfg, loc, week) ? restDayHours(person) : 0);
  return Math.round((person.hours * n) / 7 * 2) / 2;
}
// Descansos semanales trabajados (a pagar o compensar más adelante).
export function owedRest(cfg, loc, week, entry) {
  return noDayOffWeek(cfg, loc, week) && entry && entry.days && entry.days.filter(Boolean).length === 7 ? 1 : 0;
}

export function splitHours(H, D) {
  const total = Math.round(H * 2);
  const base = Math.floor(total / D);
  const extra = total - base * D;
  return Array.from({ length: D }, (_, i) => (base + (i < extra ? 1 : 0)) / 2);
}
export function workDaysFor(H, rules) {
  const maxDay = rules.maxDay;
  return Math.min(rules.maxDays, Math.max(Math.ceil(H / maxDay), H >= 36 ? rules.maxDays : Math.ceil(H / 7.5)));
}

function restOk(rules, prevEnd, s, e, nextStart) {
  if (prevEnd != null && 24 - prevEnd + s < rules.minRest - 1e-9) return false;
  if (nextStart != null && 24 - e + nextStart < rules.minRest - 1e-9) return false;
  return true;
}

// Errores de reglas personales (bloquean "confirmar").
export function personalErrors(cfg, name, entry, prevSunday, week) {
  const person = cfg.people[name];
  const R = cfg.rules;
  const errs = [];
  if (!entry || !entry.days) return ['Todavía no cargaste tu semana.'];
  const days = entry.days;
  const tot = hoursOf(days);
  const nodo = noDayOffWeek(cfg, entry.loc, week);
  const H = targetHours(person, week, cfg, entry.loc);
  const av = availDays(person, week);
  if (Math.abs(tot - H) > 0.01) {
    errs.push(tot < H ? `Te faltan ${fmtH(H - tot)} para llegar a tus ${fmtH(H)} semanales.` : `Te pasaste ${fmtH(tot - H)} de tus ${fmtH(H)} semanales.`);
  }
  const worked = days.filter(Boolean).length;
  if (!nodo && (worked > R.maxDays || (worked === 7 && av.every(Boolean)))) errs.push('Tenés que tener al menos un día libre.');
  const reqs = weekReq(cfg, entry.loc, week);
  let wk = 0;
  days.forEach((s, d) => {
    if (!s) return;
    const len = s[1] - s[0];
    const r = reqs[d];
    if (d >= 5) wk++;
    if (!av[d]) errs.push(`${DAYS[d]}: todavía no estás en el equipo ese día.`);
    if (len > R.maxDay + 1e-9) errs.push(`${DAYS[d]}: el turno no puede pasar de ${fmtH(R.maxDay)}.`);
    if (len < R.minShift - 1e-9) errs.push(`${DAYS[d]}: el turno mínimo es de ${fmtH(R.minShift)}.`);
    if (r && r.closed) errs.push(`${DAYS[d]}: el local está cerrado.`);
    else if (r && (s[0] < r.open - 1e-9 || s[1] > r.close + 1e-9)) errs.push(`${DAYS[d]}: el local abre de ${fmt(r.open)} a ${fmt(r.close)}.`);
    if (person.maxEnd != null && s[1] > person.maxEnd + 1e-9) errs.push(`${DAYS[d]}: tu horario llega hasta las ${fmt(person.maxEnd)}.`);
    const prev = d === 0 ? prevSunday : days[d - 1];
    if (prev && 24 - prev[1] + s[0] < R.minRest - 1e-9) errs.push(`${DAYS[d]}: tenés que descansar ${R.minRest} h desde que terminás el día anterior (${fmt(prev[1])}).`);
  });
  const anyWeekendOpen = reqs.slice(5).some((r, i) => r && !r.closed && av[5 + i]);
  if (anyWeekendOpen && wk < R.minWeekendDays) errs.push('Los fines de semana se necesita a todo el equipo: tenés que trabajar al menos un sábado o domingo.');
  return errs;
}
export function fmtH(h) {
  const H = Math.floor(h + 1e-9);
  const m = Math.round((h - H) * 60);
  return m ? `${H} h ${m} min` : `${H} h`;
}

// Mejor inicio para un turno de largo `len` en el día d, sumando una persona a `have`.
export function bestStart(cfg, person, req, have, d, len, prevEnd, nextStart) {
  if (!req || req.closed) return null;
  let best = null, bv = -1;
  for (let s = req.open; s + len <= req.close + 1e-9; s += 0.5) {
    const e = s + len;
    if (person.maxEnd != null && e > person.maxEnd + 1e-9) continue;
    if (!restOk(cfg.rules, prevEnd, s, e, nextStart)) continue;
    let v = 0;
    for (let i = Math.round(s * 2); i < Math.round(e * 2); i++) v += weight(d, i) * (10 * (have[i] < req.mn[i] ? 1 : 0) + (have[i] < req.ideal[i] ? 1 : 0));
    if (v > bv + 1e-9) { bv = v; best = s; }
  }
  return best === null ? null : { s: best, v: bv };
}

// Arma una semana que cubre lo que más falta, respetando las reglas personales.
export function autoFill(cfg, name, loc, week, entries, prevSunday, keepDays) {
  const person = cfg.people[name];
  const R = cfg.rules;
  const reqs = weekReq(cfg, loc, week);
  const have = Array.from({ length: 7 }, (_, d) => haveArr(entries, loc, d, name));
  const av = availDays(person, week);
  const Ht = targetHours(person, week, cfg, loc);
  const nav = av.filter(Boolean).length;
  const D = noDayOffWeek(cfg, loc, week) && nav >= 7 ? 7 : Math.min(workDaysFor(person.hours, R), nav >= 7 ? R.maxDays : nav);
  if (Ht <= 0) return new Array(7).fill(null);
  const lens = splitHours(Ht, D).sort((a, b) => b - a);
  const lenMax = lens[0];
  // Valor potencial de cada día con el turno más largo
  const pot = reqs.map((r, d) => {
    if (!r || r.closed || !av[d]) return -1;
    const b = bestStart(cfg, person, r, have[d], d, Math.min(lenMax, r.close - r.open), null, null);
    return b ? b.v : -1;
  });
  // Un fin de semana como mínimo
  const order = pot.map((v, d) => [v, d]).sort((a, b) => b[0] - a[0]).map((x) => x[1]).filter((d) => pot[d] >= 0);
  let chosen = order.slice(0, D);
  const wkCount = () => chosen.filter((d) => d >= 5).length;
  if (wkCount() < R.minWeekendDays) {
    const wkDays = order.filter((d) => d >= 5 && !chosen.includes(d));
    if (wkDays.length) { chosen.pop(); chosen.push(wkDays[0]); }
  }
  chosen.sort((a, b) => pot[b] - pot[a]);
  const days = new Array(7).fill(null);
  const lenOf = {};
  chosen.forEach((d, i) => { lenOf[d] = Math.min(lens[i] ?? lens[lens.length - 1], reqs[d].close - reqs[d].open); });
  const place = (d) => {
    const prevEnd = d === 0 ? (prevSunday ? prevSunday[1] : null) : days[d - 1] ? days[d - 1][1] : null;
    const nextStart = d < 6 && days[d + 1] ? days[d + 1][0] : null;
    let b = bestStart(cfg, person, reqs[d], have[d], d, lenOf[d], prevEnd, nextStart);
    if (!b) b = bestStart(cfg, person, reqs[d], have[d], d, lenOf[d], null, null);
    if (b) days[d] = [b.s, b.s + lenOf[d]];
  };
  for (let pass = 0; pass < 3; pass++) {
    for (const d of chosen) { days[d] = null; place(d); }
  }
  return days;
}

// Déficit duro (personas que faltan × media hora) con una semana tentativa.
export function hardDeficit(cfg, loc, week, entries) {
  const reqs = weekReq(cfg, loc, week);
  let t = 0;
  reqs.forEach((r, d) => {
    if (!r || r.closed) return;
    const have = haveArr(entries, loc, d);
    for (let i = 0; i < NS; i++) t += Math.max(0, r.mn[i] - have[i]) * 0.5;
  });
  return t;
}

// ¿Esta persona puede confirmar? Devuelve {ok, errors, suggestion, reason}
export function checkConfirm(cfg, name, entry, entries, prevSunday, week) {
  const errors = personalErrors(cfg, name, entry, prevSunday, week);
  if (errors.length) return { ok: false, errors };
  const loc = entry.loc;
  const withMe = { ...entries, [name]: entry };
  const cur = hardDeficit(cfg, loc, week, withMe);
  const sugDays = autoFill(cfg, name, loc, week, entries, prevSunday);
  const sug = { ...entry, days: sugDays };
  const best = hardDeficit(cfg, loc, week, { ...entries, [name]: sug });
  // Horas que todavía pueden aportar las personas que no cargaron nada
  const pending = Object.keys(cfg.people).filter((n) => n !== name && cfg.people[n].locs.includes(loc) && targetHours(cfg.people[n], week, cfg, loc) > 0 && !(entries[n] && entries[n].days && entries[n].days.some(Boolean)));
  const capacity = pending.reduce((a, n) => a + targetHours(cfg.people[n], week, cfg, loc), 0);
  if (cur > best + 0.01 && cur > capacity + 0.01) {
    return {
      ok: false,
      errors: [`Con este horario quedarían ${fmtH(cur)} sin cubrir y el resto del equipo no llega a completarlos. Hay una combinación tuya que deja ${fmtH(best)} sin cubrir.`],
      suggestion: sugDays,
      blockedByCoverage: true,
    };
  }
  return { ok: true, errors: [], remaining: cur };
}

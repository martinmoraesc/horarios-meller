import * as R from '/rules.js';
const { DAYS, DS, NS, fmt, rng, fmtH, addDays, mondayOf } = R;

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const app = $('#app');

const S = {
  token: null, role: null, name: null,
  week: null, data: null, loc: null, tab: 'mine', atab: 'week',
  who: null, // persona que se está editando (el admin puede editar a otros)
  entry: null, dirty: false, saving: false, errors: [], suggestion: null, canForce: false,
};
try { const t = JSON.parse(localStorage.getItem('hm') || 'null'); if (t) Object.assign(S, { token: t.token, role: t.role, name: t.name }); } catch {}

async function api(path, opts = {}) {
  const r = await fetch(path, {
    method: opts.body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && S.token) { logout(); throw new Error('Tu sesión venció. Entrá de nuevo.'); }
  if (!r.ok) { const e = new Error(j.error || 'Error ' + r.status); e.status = r.status; e.body = j; throw e; }
  return j;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200);
}
function logout() { S.token = S.role = S.name = null; S.data = null; S.entry = null; S.who = null; try { localStorage.removeItem('hm'); } catch {} render(); }

/* ---------- Ingreso ---------- */
async function loginView() {
  let names = [], hasPin = {};
  try { ({ names, hasPin } = await api('/api/people')); } catch (e) { app.innerHTML = `<div class="card"><h2>No se pudo cargar</h2><p class="mut">${esc(e.message)}</p></div>`; return; }
  let pick = null, admin = false;
  const draw = () => {
    app.innerHTML = `
      <h1>¿Quién sos?</h1><p class="mut" style="margin:6px 0 16px">Elegí tu nombre y poné tu PIN de 4 números.</p>
      <div class="grid names" role="group" aria-label="Personas">${names.map((n) => `<button data-n="${esc(n)}" aria-pressed="${pick === n}">${esc(n)}</button>`).join('')}</div>
      <div class="card" style="margin-top:14px" ${pick || admin ? '' : 'hidden'}>
        <div class="field"><label for="pin">${admin ? 'Clave de administrador' : 'PIN de ' + esc(pick || '')}</label>
        <input id="pin" class="${admin ? '' : 'pin'}" type="password" ${admin ? '' : 'inputmode="numeric" maxlength="4"'} autocomplete="current-password"></div>
        <p id="err" class="small" style="color:var(--bad);min-height:20px"></p>
        <button class="btn pri" id="go" style="width:100%">Entrar</button>
        ${pick && !hasPin[pick] ? '<p class="small mut" style="margin-top:8px">Todavía no tenés PIN: pedíselo a Martín.</p>' : ''}
      </div>
      <p style="margin-top:18px"><button class="btn sm" id="adm">${admin ? 'Volver' : 'Soy Martín (administrador)'}</button></p>`;
    $('#pin') && ($('#pin').focus());
  };
  draw();
  const go = async () => {
    $('#err').textContent = '';
    try {
      const r = await api('/api/login', { body: admin ? { admin: true, pin: $('#pin').value } : { name: pick, pin: $('#pin').value } });
      Object.assign(S, { token: r.token, role: r.role, name: r.name });
      try { localStorage.setItem('hm', JSON.stringify({ token: r.token, role: r.role, name: r.name })); } catch {}
      S.week = null; S.data = null; S.entry = null; S.who = null; render();
    } catch (e) { $('#err').textContent = e.message; }
  };
  app.onclick = (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.n) { pick = b.dataset.n; admin = false; draw(); }
    else if (b.id === 'go') go();
    else if (b.id === 'adm') { admin = !admin; pick = null; draw(); }
  };
  app.onkeydown = (ev) => { if (ev.key === 'Enter' && ev.target.id === 'pin') go(); };
}

/* ---------- Datos de la semana ---------- */
async function load(week) {
  const q = week ? '?week=' + week : '';
  const d = await api('/api/state' + q);
  S.data = d; S.week = d.week;
}
function myName() { return S.role === 'admin' ? S.who : S.name; }
function currentEntry() {
  const n = myName();
  const e = S.data.entries[n];
  const p = S.data.cfg.people[n];
  const loc = (e && e.loc) || (S.loc && p.locs.includes(S.loc) ? S.loc : p.locs[0]);
  return e ? { loc: e.loc, days: e.days.map((d) => (d ? [...d] : null)), status: e.status, forced: e.forced } : { loc, days: new Array(7).fill(null), status: 'none' };
}
function entriesWithMine() {
  const n = myName();
  const all = { ...S.data.entries };
  if (S.entry) all[n] = S.entry;
  return all;
}
const prevSunday = () => S.data.prevSunday[myName()] || null;

/* ---------- Guardado ---------- */
let saveT;
function touch() {
  S.dirty = true; S.errors = []; S.suggestion = null; S.canForce = false;
  if (S.entry.status === 'confirmed') S.entry.status = 'draft';
  clearTimeout(saveT); saveT = setTimeout(saveDraft, 900);
}
async function saveDraft() {
  if (!S.dirty || S.saving) return;
  S.saving = true;
  try {
    const r = await api('/api/save', { body: { week: S.week, name: myName(), entry: { loc: S.entry.loc, days: S.entry.days }, status: 'draft' } });
    S.data.entries[myName()] = r.entry; S.dirty = false;
  } catch (e) { toast(e.message); }
  S.saving = false;
}
async function confirm(force) {
  clearTimeout(saveT);
  try {
    const r = await api('/api/save', { body: { week: S.week, name: myName(), entry: { loc: S.entry.loc, days: S.entry.days }, status: 'confirmed', force: !!force } });
    S.data.entries[myName()] = r.entry; S.entry = currentEntry(); S.dirty = false; S.errors = []; S.suggestion = null; S.canForce = false;
    toast(r.entry.forced ? 'Confirmada. Martín va a ver que quedaron horas sin cubrir.' : 'Semana confirmada. Gracias.');
  } catch (e) {
    if (e.status === 422) { S.errors = e.body.errors || []; S.suggestion = e.body.suggestion || null; S.canForce = !!e.body.canForce; }
    else toast(e.message);
  }
  renderEditor();
}

/* ---------- Editor semanal (staff) ---------- */
function weekLabel(w) {
  const a = w, b = addDays(w, 6);
  const m = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${+a.slice(8)} ${a.slice(5, 7) === b.slice(5, 7) ? '' : m[+a.slice(5, 7) - 1]} al ${+b.slice(8)} ${m[+b.slice(5, 7) - 1]}`.replace('  ', ' ');
}
function weekNav(target) {
  return `<div class="weeknav"><button data-go="prev" aria-label="Semana anterior">‹</button><div class="t">${weekLabel(S.week)}</div><button data-go="next" aria-label="Semana siguiente">›</button></div>`;
}
function strip(req, have, d, mine) {
  if (!req) return '<p class="small mut">Todavía no hay requisitos cargados para estos días.</p>';
  if (req.closed) return '<p class="small mut">Cerrado.</p>';
  let cells = '', ax = '';
  for (let i = Math.round(req.open * 2); i < Math.round(req.close * 2); i++) {
    const n = have[i], m = req.mn[i];
    const inMine = mine && i >= Math.round(mine[0] * 2) && i < Math.round(mine[1] * 2);
    const cls = n < m ? 'lo' : n >= req.ideal[i] && req.ideal[i] > m ? 'hi' : n >= m + 2 ? 'hi' : '';
    cells += `<b class="${cls} ${inMine ? 'me' : ''}" title="${fmt(i / 2)}: hay ${n}, mínimo ${m}">${n}</b>`;
  }
  for (let h = req.open; h <= req.close; h += req.close - req.open > 12 ? 4 : 2) ax += `<span>${fmt(h)}</span>`;
  return `<div class="strip" role="img" aria-label="Personas por media hora">${cells}</div><div class="ax">${ax}</div>`;
}
function timeOptions(from, to, sel) {
  let o = '';
  for (let h = from; h <= to + 1e-9; h += 0.5) o += `<option value="${h}" ${Math.abs(h - sel) < 1e-9 ? 'selected' : ''}>${fmt(h)}</option>`;
  return o;
}
function dayCard(d, reqs, cfg, person) {
  const iso = addDays(S.week, d);
  const req = reqs[d];
  const s = S.entry.days[d];
  const av = R.availDays(person, S.week)[d];
  const have = R.haveArr(entriesWithMine(), S.entry.loc, d);
  const we = d >= 5;
  let gap = '';
  if (req && !req.closed) {
    const g = R.gapsOf(cfg, S.entry.loc, S.week, entriesWithMine()).filter((x) => x.dow === d);
    gap = g.length
      ? `<p class="gaptxt">Falta gente: ${g.map((x) => `${fmt(x.from)}–${fmt(x.to)} (${x.missing})`).join(' · ')}</p>`
      : '<p class="gaptxt ok">Este día queda cubierto.</p>';
  }
  const fixable = req && !req.closed && av;
  return `<section class="card day ${we ? 'we' : ''}" data-d="${d}">
    <h3><span>${DAYS[d]} ${+iso.slice(8)}/${iso.slice(5, 7)}</span><small>${we ? 'todo el equipo' : req && !req.closed ? `${fmt(req.open)}–${fmt(req.close)}` : ''}</small></h3>
    ${!av ? '<p class="small mut" style="margin-top:6px">Todavía no estás en el equipo este día.</p>' :
    `<div class="tog" role="group"><button data-a="off" aria-pressed="${!s}">Libre</button><button data-a="on" aria-pressed="${!!s}">Trabajo</button></div>
    ${s && req && !req.closed ? `<div class="times">
      <label>Entra<select data-a="in">${timeOptions(req.open, req.close - 0.5, s[0])}</select></label>
      <label>Sale<select data-a="out">${timeOptions(s[0] + 0.5, req.close, s[1])}</select></label>
      <div class="h">${fmtH(s[1] - s[0])}</div></div>` : ''}`}
    ${strip(req, have, d, s)}
    ${gap}
    ${fixable ? `<div class="row" style="margin-top:8px"><button class="btn sm" data-a="fill">${s ? 'Mover a donde más falta' : 'Cubrir lo que falta'}</button></div>` : ''}
  </section>`;
}
function renderEditor() {
  const n = myName();
  const cfg = S.data.cfg, person = cfg.people[n];
  if (!S.entry) S.entry = currentEntry();
  const e = S.entry;
  const reqs = R.weekReq(cfg, e.loc, S.week);
  const tot = R.hoursOf(e.days), H = R.targetHours(person, S.week);
  const pct = H ? Math.min(100, (tot / H) * 100) : 0;
  const errs = S.errors.length ? S.errors : R.personalErrors(cfg, n, e, prevSunday(), S.week);
  const gaps = R.gapsOf(cfg, e.loc, S.week, entriesWithMine());
  const gh = R.gapHours(gaps);
  const state = e.status === 'confirmed' ? '<span class="pill ok">Confirmada</span>' : e.status === 'locked' ? '<span class="pill">Cerrada</span>' : tot ? '<span class="pill warn">Borrador</span>' : '<span class="pill">Sin cargar</span>';
  const locSel = person.locs.length > 1 ? `<div class="field"><label for="loc">Local</label><select id="loc">${person.locs.map((l) => `<option value="${l}" ${l === e.loc ? 'selected' : ''}>${esc(cfg.locs[l].name)}</option>`).join('')}</select></div>` : '';
  const showErrs = S.errors.length || (tot > 0 && errs.length);
  const body = S.tab === 'team' ? teamView(cfg, e.loc) : `
    <div class="card">
      <div class="row sb"><h2>${S.role === 'admin' ? esc(n) : 'Mi semana'}</h2>${state}</div>
      ${locSel}
      <div class="prog" role="progressbar" aria-valuenow="${tot}" aria-valuemax="${H}"><i class="${tot > H + 0.01 ? 'over' : Math.abs(tot - H) < 0.01 ? 'full' : ''}" style="width:${pct}%"></i></div>
      <p class="small"><b class="mono">${fmtH(tot)}</b> de ${fmtH(H)} esta semana</p>
      ${showErrs ? `<div class="alert bad"><b>Para confirmar:</b><ul>${errs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${S.suggestion ? '<div class="row" style="margin-top:8px"><button class="btn sm pri" data-a="applysug">Usar la combinación sugerida</button></div>' : ''}
        ${S.canForce ? '<div class="row" style="margin-top:8px"><button class="btn sm" data-a="force">Confirmar igual y avisar a Martín</button></div>' : ''}</div>` : ''}
      ${gh > 0 ? `<div class="alert warn"><b>Faltan ${fmtH(gh)} por cubrir esta semana.</b> Los sábados y domingos y las tardes son lo más importante. Tocá "Cubrir lo que falta" en el día que quieras.</div>` : (reqs.some((r) => r && !r.closed) ? '<div class="alert ok">Con tu horario la semana queda toda cubierta.</div>' : '<div class="alert warn">Todavía no hay requisitos cargados para esta semana.</div>')}
    </div>
    <div class="legend"><span><i style="background:var(--ok)"></i>cumple</span><span><i style="background:var(--ok2)"></i>de sobra</span><span><i style="background:var(--bad)"></i>falta gente</span><span>Raya negra: tu turno · el número es cuántos hay</span></div>
    ${[0, 1, 2, 3, 4, 5, 6].map((d) => dayCard(d, reqs, cfg, person)).join('')}`;
  app.innerHTML = `${S.role === 'admin' ? '<p style="margin-bottom:10px"><button class="btn sm" data-go="back">‹ Volver al panel</button></p>' : ''}
    ${weekNav()}
    <div class="tabs"><button data-t="mine" aria-selected="${S.tab === 'mine'}">Mi semana</button><button data-t="team" aria-selected="${S.tab === 'team'}">Todo el equipo</button></div>
    ${body}
    ${S.tab === 'mine' ? `<div class="bar"><div class="bar-in"><button class="btn" data-a="suggest">Sugerime mi semana</button><button class="btn pri" data-a="confirm" ${e.status === 'confirmed' && !S.dirty ? 'disabled' : ''}>${e.status === 'confirmed' ? 'Confirmada' : 'Confirmar semana'}</button></div></div>` : ''}`;
}
function teamView(cfg, loc) {
  const reqs = R.weekReq(cfg, loc, S.week);
  const all = entriesWithMine();
  const names = Object.keys(cfg.people).filter((n) => cfg.people[n].locs.includes(loc) && R.targetHours(cfg.people[n], S.week) > 0);
  const gaps = R.gapsOf(cfg, loc, S.week, all);
  return `<div class="card"><h2>${esc(cfg.locs[loc].name)}</h2>
    <p class="small mut" style="margin:4px 0 8px">${gaps.length ? `Faltan ${fmtH(R.gapHours(gaps))} por cubrir.` : 'Cobertura completa.'}</p>
    <div class="scroll"><table><thead><tr><th>Quién</th>${DS.map((d) => `<th>${d}</th>`).join('')}</tr></thead><tbody>
    ${names.map((n) => { const e = all[n]; return `<tr><td><b>${esc(n)}</b><br>${!e || !e.days.some(Boolean) ? '<span class="pill">sin cargar</span>' : e.status === 'confirmed' ? '<span class="pill ok">confirmó</span>' : '<span class="pill warn">borrador</span>'}</td>${(e && e.loc === loc ? e.days : new Array(7).fill(null)).map((s) => `<td>${s ? `<span class="chip">${rng(s)}</span>` : '<span class="chip off">libre</span>'}</td>`).join('')}</tr>`; }).join('')}
    </tbody></table></div></div>
    ${[0, 1, 2, 3, 4, 5, 6].map((d) => `<section class="card day ${d >= 5 ? 'we' : ''}"><h3><span>${DAYS[d]} ${+addDays(S.week, d).slice(8)}</span></h3>${strip(reqs[d], R.haveArr(all, loc, d), d, null)}</section>`).join('')}`;
}
function setShift(d, s) { S.entry.days[d] = s; touch(); renderEditor(); }
function defaultLen(person) { return Math.min(R.splitHours(R.targetHours(person, S.week) || 7, R.workDaysFor(person.hours, S.data.cfg.rules))[0] || 7, S.data.cfg.rules.maxDay); }

function editorClick(ev) {
  const el = ev.target.closest('button'); if (!el) return;
  const cfg = S.data.cfg, n = myName(), person = cfg.people[n];
  if (el.dataset.go) return nav(el.dataset.go);
  if (el.dataset.t) { S.tab = el.dataset.t; return renderEditor(); }
  const a = el.dataset.a; if (!a) return;
  const card = el.closest('[data-d]'); const d = card ? +card.dataset.d : null;
  const reqs = R.weekReq(cfg, S.entry.loc, S.week);
  if (a === 'off') { setShift(d, null); }
  else if (a === 'on') {
    const r = reqs[d]; if (!r || r.closed) return toast('Ese día el local está cerrado.');
    const len = Math.min(defaultLen(person), r.close - r.open);
    const have = R.haveArr(entriesWithMine(), S.entry.loc, d, n);
    const b = R.bestStart(cfg, person, r, have, d, len, d === 0 ? (prevSunday() || [0, 0])[1] || null : S.entry.days[d - 1]?.[1] ?? null, S.entry.days[d + 1]?.[0] ?? null) || { s: r.open };
    setShift(d, [b.s, b.s + len]);
  } else if (a === 'fill') {
    const r = reqs[d]; if (!r || r.closed) return;
    const cur = S.entry.days[d];
    const len = cur ? cur[1] - cur[0] : Math.min(defaultLen(person), r.close - r.open);
    const have = R.haveArr(entriesWithMine(), S.entry.loc, d, n);
    const pe = d === 0 ? (prevSunday() ? prevSunday()[1] : null) : S.entry.days[d - 1]?.[1] ?? null;
    const b = R.bestStart(cfg, person, r, have, d, len, pe, S.entry.days[d + 1]?.[0] ?? null);
    if (!b) return toast('Con tus reglas de descanso no hay otro horario ese día.');
    setShift(d, [b.s, b.s + len]);
  } else if (a === 'suggest') {
    const e0 = { ...S.data.entries }; delete e0[n];
    S.entry.days = R.autoFill(cfg, n, S.entry.loc, S.week, e0, prevSunday());
    touch(); renderEditor(); toast('Armé una semana que cubre lo que más falta. Podés cambiar lo que quieras.');
  } else if (a === 'confirm') confirm(false);
  else if (a === 'force') confirm(true);
  else if (a === 'applysug') { S.entry.days = S.suggestion; touch(); renderEditor(); }
}
function editorChange(ev) {
  const el = ev.target;
  if (el.id === 'loc') { S.entry.loc = el.value; S.entry.days = new Array(7).fill(null); touch(); return renderEditor(); }
  const a = el.dataset.a; if (!a) return;
  const d = +el.closest('[data-d]').dataset.d;
  const s = S.entry.days[d]; const v = +el.value;
  if (a === 'in') { const len = Math.min(s[1] - s[0], 99); const reqs = R.weekReq(S.data.cfg, S.entry.loc, S.week); let e = v + len; if (e > reqs[d].close) e = reqs[d].close; if (e <= v) e = v + 0.5; setShift(d, [v, e]); }
  if (a === 'out') setShift(d, [s[0], v]);
}
async function nav(dir) {
  if (dir === 'back') { S.who = null; S.entry = null; return render(); }
  await saveDraft();
  const w = addDays(S.week, dir === 'next' ? 7 : -7);
  try { await load(w); S.entry = null; S.errors = []; render(); } catch (e) { toast(e.message); }
}

/* ---------- Panel de Martín ---------- */
function statusOf(e) { return !e || !e.days.some(Boolean) ? 'none' : e.status; }
function adminWeek() {
  const cfg = S.data.cfg, loc = S.loc || Object.keys(cfg.locs)[0];
  const all = S.data.entries;
  const gaps = R.gapsOf(cfg, loc, S.week, all), gh = R.gapHours(gaps);
  const names = Object.keys(cfg.people).filter((n) => cfg.people[n].locs.includes(loc) && R.targetHours(cfg.people[n], S.week) > 0);
  const pill = (st, e) => ({ none: '<span class="pill bad">sin cargar</span>', draft: '<span class="pill warn">borrador</span>', confirmed: `<span class="pill ok">confirmó${e && e.forced ? ' con faltantes' : ''}</span>`, locked: '<span class="pill">cerrada</span>' }[st]);
  return `${weekNav()}
    <div class="field"><label for="aloc">Local</label><select id="aloc">${Object.entries(cfg.locs).map(([k, v]) => `<option value="${k}" ${k === loc ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>
    <div class="card"><div class="row sb"><h2>Estado</h2>${gh ? `<span class="pill bad">faltan ${fmtH(gh)}</span>` : '<span class="pill ok">cobertura completa</span>'}</div>
      <div class="scroll"><table><thead><tr><th>Persona</th><th>Estado</th><th>Horas</th><th></th></tr></thead><tbody>
      ${names.map((n) => { const e = all[n]; const st = statusOf(e); return `<tr><td><b>${esc(n)}</b></td><td>${pill(st, e)}</td><td class="mono">${e && e.loc === loc ? R.hoursOf(e.days) : 0}/${R.targetHours(cfg.people[n], S.week)}</td>
        <td><button class="btn sm" data-edit="${esc(n)}">Ver / editar</button> ${st === 'confirmed' ? `<button class="btn sm" data-lock="${esc(n)}" data-to="locked">Cerrar</button>` : ''}${st === 'locked' ? `<button class="btn sm" data-lock="${esc(n)}" data-to="draft">Reabrir</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div></div>
    ${gaps.length ? `<div class="card"><h3>Lo que falta cubrir</h3><ul style="margin:6px 0 0;padding-left:18px">${gaps.map((g) => `<li>${DAYS[g.dow]} ${fmt(g.from)}–${fmt(g.to)}: falta${g.missing > 1 ? 'n' : ''} ${g.missing}</li>`).join('')}</ul></div>` : ''}
    <div class="row"><button class="btn dark" id="mail">Mandarme el resumen por mail</button><button class="btn" id="csv">Bajar CSV para comparar con el reloj</button></div>
    <div style="margin-top:14px">${teamView(cfg, loc)}</div>`;
}
let adminCfgDraft = null;
async function adminTeam() {
  const { cfg, hasPin } = await api('/api/admin?action=cfg');
  adminCfgDraft = adminCfgDraft || JSON.parse(JSON.stringify(cfg));
  const c = adminCfgDraft;
  return `<div class="card"><h2>Equipo</h2><p class="small mut" style="margin:4px 0 10px">Horas por semana, locales donde trabaja, fecha de ingreso y hora máxima de salida (por ejemplo, para quien no puede cerrar).</p>
    <div class="scroll"><table><thead><tr><th>Nombre</th><th>Horas</th><th>Locales</th><th>Desde</th><th>Sale hasta</th><th>PIN</th><th></th></tr></thead><tbody>
    ${Object.entries(c.people).map(([n, p]) => `<tr data-p="${esc(n)}"><td><b>${esc(n)}</b></td>
      <td><input type="number" step="0.5" min="0" max="60" data-f="hours" value="${p.hours}" style="width:80px"></td>
      <td class="locs">${Object.entries(c.locs).map(([k, v]) => `<label><input type="checkbox" data-f="loc" data-k="${k}" ${p.locs.includes(k) ? 'checked' : ''}>${esc(v.name)}</label>`).join('')}</td>
      <td><input type="date" data-f="from" value="${p.from || ''}"></td>
      <td><input type="number" step="0.5" min="0" max="24" data-f="maxEnd" value="${p.maxEnd ?? ''}" placeholder="—" style="width:80px"></td>
      <td><button class="btn sm" data-pin="${esc(n)}">${hasPin[n] ? 'Nuevo PIN' : 'Generar PIN'}</button></td>
      <td><button class="btn sm" data-del="${esc(n)}" aria-label="Quitar ${esc(n)}">Quitar</button></td></tr>`).join('')}
    </tbody></table></div>
    <div class="row" style="margin-top:12px"><input id="newname" type="text" placeholder="Nombre nuevo" style="max-width:220px"><button class="btn" id="addp">Agregar persona</button><button class="btn pri" id="savecfg">Guardar equipo</button></div></div>`;
}
async function adminPeriods() {
  const { cfg } = await api('/api/admin?action=cfg');
  adminCfgDraft = adminCfgDraft || JSON.parse(JSON.stringify(cfg));
  const view = { rules: adminCfgDraft.rules, periods: adminCfgDraft.periods };
  return `<div class="card"><h2>Etapas y requisitos</h2>
    <p class="small mut" style="margin:4px 0 10px">Cada etapa tiene fechas, el horario de apertura y cuántas personas hacen falta en cada tramo: <span class="mono">[desde, hasta, personas]</span>. "ideal" es lo deseable por encima del mínimo. Si querés que te lo cambie, mandame lo que querés y lo editamos juntos.</p>
    <textarea id="periods" spellcheck="false" aria-label="Etapas en formato JSON">${esc(JSON.stringify(view, null, 1))}</textarea>
    <p id="perr" class="small" style="color:var(--bad);min-height:20px"></p>
    <button class="btn pri" id="saveper">Guardar etapas</button></div>`;
}
async function adminLog() {
  const { log } = await api('/api/admin?action=log');
  const label = { draft: 'guardó borrador', confirmed: 'confirmó', locked: 'cerró', pin: 'nuevo PIN', cfg: 'cambió la configuración' };
  return `<div class="card"><h2>Registro</h2><p class="small mut" style="margin:4px 0 10px">Todo lo que se cargó y cuándo (hora de Uruguay).</p>
    <div class="scroll"><table><tbody>${log.map((l) => `<tr><td class="mono small">${new Date(l.at).toLocaleString('es-UY', { timeZone: 'America/Montevideo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td><b>${esc(l.name || '')}</b> ${label[l.type] || esc(l.type)}${l.week ? ` · semana ${esc(l.week.slice(8) + '/' + l.week.slice(5, 7))}` : ''}${l.forced ? ' <span class="pill bad">con faltantes</span>' : ''}${l.by && l.by !== l.name && l.name ? ` <span class="mut small">(por ${esc(l.by)})</span>` : ''}${l.days ? `<br><span class="mono small mut">${l.days.map((s, d) => `${DS[d]} ${s ? rng(s) : '—'}`).join(' · ')}</span>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
}
async function adminView() {
  const tabs = [['week', 'Semana'], ['team', 'Equipo'], ['per', 'Etapas'], ['log', 'Registro']];
  let inner = '';
  try {
    if (S.atab === 'week') inner = adminWeek();
    else if (S.atab === 'team') inner = await adminTeam();
    else if (S.atab === 'per') inner = await adminPeriods();
    else inner = await adminLog();
  } catch (e) { inner = `<div class="card"><p>${esc(e.message)}</p></div>`; }
  app.innerHTML = `<h1 style="margin-bottom:12px">Panel</h1><div class="tabs">${tabs.map(([k, v]) => `<button data-at="${k}" aria-selected="${S.atab === k}">${v}</button>`).join('')}</div>${inner}`;
}
function pinModal(name, pin) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="card"><h2>PIN de ${esc(name)}</h2><div class="pinshow">${pin}</div><p class="small mut">Mandáselo ahora por WhatsApp. Por seguridad no se vuelve a mostrar; si lo pierde, generás uno nuevo.</p><button class="btn pri" style="width:100%;margin-top:12px">Listo</button></div>`;
  m.onclick = (e) => { if (e.target.tagName === 'BUTTON' || e.target === m) m.remove(); };
  document.body.appendChild(m);
}
async function adminClick(ev) {
  const el = ev.target.closest('button'); if (!el) return;
  try {
    if (el.dataset.go && el.dataset.go !== 'back') { await load(addDays(S.week, el.dataset.go === 'next' ? 7 : -7)); return render(); }
    if (el.dataset.at) { S.atab = el.dataset.at; return render(); }
    if (el.dataset.edit) { S.who = el.dataset.edit; S.entry = null; S.tab = 'mine'; return render(); }
    if (el.dataset.lock) { await api('/api/admin', { body: { action: 'setStatus', week: S.week, name: el.dataset.lock, status: el.dataset.to } }); await load(S.week); return render(); }
    if (el.id === 'mail') { el.disabled = true; await api('/api/admin', { body: { action: 'sendMail', week: S.week } }); el.disabled = false; return toast('Te mandé el resumen por mail.'); }
    if (el.id === 'csv') {
      const r = await fetch('/api/export?week=' + S.week, { headers: { authorization: 'Bearer ' + S.token } });
      const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `horarios-${S.week}.csv`; a.click(); return;
    }
    if (el.dataset.pin) { const r = await api('/api/admin', { body: { action: 'genPin', name: el.dataset.pin } }); pinModal(el.dataset.pin, r.pin); adminCfgDraft = null; return; }
    if (el.dataset.del) { if (!el.dataset.sure) { el.dataset.sure = 1; el.textContent = '¿Seguro?'; return; } delete adminCfgDraft.people[el.dataset.del]; return render(); }
    if (el.id === 'addp') { const n = $('#newname').value.trim(); if (!n) return; if (adminCfgDraft.people[n]) return toast('Ya existe.'); adminCfgDraft.people[n] = { locs: [Object.keys(adminCfgDraft.locs)[0]], hours: 44 }; return render(); }
    if (el.id === 'savecfg') { readTeam(); await api('/api/admin', { body: { action: 'saveCfg', cfg: adminCfgDraft } }); adminCfgDraft = null; toast('Equipo guardado.'); return render(); }
    if (el.id === 'saveper') {
      let v; try { v = JSON.parse($('#periods').value); } catch (e) { $('#perr').textContent = 'El texto no es válido: ' + e.message; return; }
      adminCfgDraft.periods = v.periods; adminCfgDraft.rules = v.rules;
      await api('/api/admin', { body: { action: 'saveCfg', cfg: adminCfgDraft } }); adminCfgDraft = null; toast('Etapas guardadas.'); return render();
    }
  } catch (e) { toast(e.message); if (el.disabled) el.disabled = false; }
}
function readTeam() {
  document.querySelectorAll('tr[data-p]').forEach((tr) => {
    const n = tr.dataset.p, p = adminCfgDraft.people[n];
    p.hours = +tr.querySelector('[data-f=hours]').value;
    p.locs = [...tr.querySelectorAll('[data-f=loc]')].filter((x) => x.checked).map((x) => x.dataset.k);
    const f = tr.querySelector('[data-f=from]').value; if (f) p.from = f; else delete p.from;
    const m = tr.querySelector('[data-f=maxEnd]').value; if (m !== '') p.maxEnd = +m; else delete p.maxEnd;
  });
}

/* ---------- Render raíz ---------- */
async function render() {
  const who = $('#who');
  who.innerHTML = S.token ? `<span>${esc(S.name)}</span><button id="out">Salir</button>` : '';
  if (S.token) $('#out').onclick = logout;
  app.onclick = app.onchange = app.onkeydown = null;
  if (!S.token) return loginView();
  try {
    if (!S.data) await load(S.week);
    else if (!S.week) await load();
    if (S.role === 'admin' && !S.who) {
      await adminView();
      app.onclick = adminClick;
      app.onchange = (ev) => { if (ev.target.id === 'aloc') { S.loc = ev.target.value; render(); } };
      return;
    }
    if (S.role === 'staff' && !S.entry) S.loc = null;
    renderEditor();
    app.onclick = editorClick; app.onchange = editorChange;
  } catch (e) {
    if (S.token) app.innerHTML = `<div class="card"><h2>No se pudo cargar</h2><p class="mut">${esc(e.message)}</p><p style="margin-top:10px"><button class="btn" onclick="location.reload()">Reintentar</button></p></div>`;
  }
}
window.addEventListener('beforeunload', () => { if (S.dirty) saveDraft(); });
render();

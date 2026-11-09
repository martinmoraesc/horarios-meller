import { DAYS, DS, addDays, fmt, rng, hoursOf, gapsOf, gapHours, fmtH, targetHours } from '../public/rules.js';

const dmy = (iso) => iso.slice(8) + '/' + iso.slice(5, 7);
export function weekCsv(cfg, week, entries) {
  const rows = [['semana', 'fecha', 'dia', 'local', 'persona', 'entra', 'sale', 'horas', 'estado']];
  for (const [name, e] of Object.entries(entries).sort()) {
    (e.days || []).forEach((s, d) => {
      if (s) rows.push([week, addDays(week, d), DAYS[d], cfg.locs[e.loc]?.name || e.loc, name, fmt(s[0]), fmt(s[1]), String(s[1] - s[0]).replace('.', ','), e.status]);
    });
  }
  return rows.map((r) => r.join(';')).join('\n');
}

export function weekSummary(cfg, week, entries) {
  const out = { text: '', html: '', gapH: 0, missing: [] };
  const people = Object.keys(cfg.people);
  const locs = Object.keys(cfg.locs);
  let html = `<div style="font-family:Arial,sans-serif;color:#1a1714;max-width:720px">`;
  html += `<h2 style="margin:0 0 4px">Horarios del ${dmy(week)} al ${dmy(addDays(week, 6))}</h2>`;
  const none = people.filter((n) => targetHours(cfg.people[n], week) > 0 && !(entries[n] && entries[n].days && entries[n].days.some(Boolean)));
  const draft = people.filter((n) => entries[n] && entries[n].status === 'draft' && entries[n].days.some(Boolean));
  const forced = Object.keys(entries).filter((n) => entries[n].forced);
  out.missing = none;
  let text = `Horarios del ${dmy(week)} al ${dmy(addDays(week, 6))}\n`;
  html += `<p style="margin:0 0 12px;color:#6d665d">${Object.values(entries).filter((e) => e.status === 'confirmed').length} confirmaron · ${draft.length} en borrador · ${none.length} sin cargar</p>`;
  if (none.length) { html += `<p><b>Sin cargar:</b> ${none.join(', ')}</p>`; text += `Sin cargar: ${none.join(', ')}\n`; }
  if (draft.length) { html += `<p><b>En borrador (sin confirmar):</b> ${draft.join(', ')}</p>`; text += `En borrador: ${draft.join(', ')}\n`; }
  if (forced.length) { html += `<p style="color:#b4380f"><b>Confirmaron con faltantes sin resolver:</b> ${forced.join(', ')}</p>`; text += `Confirmaron igual con faltantes: ${forced.join(', ')}\n`; }
  for (const loc of locs) {
    const inLoc = Object.entries(entries).filter(([, e]) => e.loc === loc);
    const gaps = gapsOf(cfg, loc, week, entries);
    const gh = gapHours(gaps);
    out.gapH += gh;
    if (!inLoc.length && !gaps.length) continue;
    html += `<h3 style="margin:18px 0 6px">${cfg.locs[loc].name}</h3>`;
    html += `<table style="border-collapse:collapse;width:100%;font-size:13px"><tr><th style="text-align:left;padding:4px 6px;border-bottom:1px solid #ddd">Persona</th>${DS.map((d) => `<th style="padding:4px 6px;border-bottom:1px solid #ddd">${d}</th>`).join('')}<th style="padding:4px 6px;border-bottom:1px solid #ddd">Horas</th></tr>`;
    text += `\n${cfg.locs[loc].name}\n`;
    for (const [n, e] of inLoc.sort()) {
      html += `<tr><td style="padding:4px 6px;border-bottom:1px solid #eee"><b>${n}</b>${e.status !== 'confirmed' ? ' <i style="color:#999">(borrador)</i>' : ''}</td>${e.days.map((s) => `<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;white-space:nowrap">${s ? rng(s) : '<span style="color:#aaa">libre</span>'}</td>`).join('')}<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center">${hoursOf(e.days)} h</td></tr>`;
      text += `${n}: ${e.days.map((s, d) => `${DS[d]} ${s ? rng(s) : 'libre'}`).join(' · ')}\n`;
    }
    html += `</table>`;
    if (gaps.length) {
      html += `<p style="margin:10px 0 2px;color:#b4380f"><b>Faltan ${fmtH(gh)} por cubrir:</b></p><ul style="margin:0;padding-left:18px">${gaps.map((g) => `<li>${DAYS[g.dow]} ${fmt(g.from)}–${fmt(g.to)}: falta${g.missing > 1 ? 'n' : ''} ${g.missing}</li>`).join('')}</ul>`;
      text += `Faltan ${fmtH(gh)}:\n${gaps.map((g) => `- ${DAYS[g.dow]} ${fmt(g.from)}–${fmt(g.to)}: faltan ${g.missing}`).join('\n')}\n`;
    } else { html += `<p style="margin:10px 0 0;color:#256b3a"><b>Cobertura completa.</b></p>`; text += 'Cobertura completa.\n'; }
  }
  html += `<p style="margin-top:18px;color:#6d665d;font-size:12px">Adjunto va el CSV con entrada y salida de cada día para compararlo con el reloj.</p></div>`;
  out.html = html; out.text = text;
  return out;
}

export async function sendMail({ subject, html, text, csv, csvName }) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.MAIL_TO;
  if (!key || !to) throw new Error('Falta configurar RESEND_API_KEY y MAIL_TO en Vercel.');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'Horarios Meller <onboarding@resend.dev>',
      to: to.split(',').map((x) => x.trim()),
      subject, html, text,
      attachments: csv ? [{ filename: csvName || 'horarios.csv', content: Buffer.from('﻿' + csv).toString('base64') }] : undefined,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Mail: ' + (j.message || r.status));
  return j;
}

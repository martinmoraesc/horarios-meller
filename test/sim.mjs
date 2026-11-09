import { DEFAULT_CFG as cfg } from '../lib/defaults.js';
import * as R from '../public/rules.js';
function run(week, loc, names, order) {
  const entries = {};
  for (const n of order || names) {
    const p = cfg.people[n]; p.locs = p.locs;
    const days = R.autoFill(cfg, n, loc, week, entries, null);
    const e = { loc, days, status: 'confirmed' };
    const chk = R.checkConfirm(cfg, n, e, entries, null, week);
    entries[n] = e;
    console.log(n, R.hoursOf(days), chk.ok ? 'ok' : chk.errors[0]);
  }
  const g = R.gapsOf(cfg, loc, week, entries);
  console.log(week, loc, 'gap h', R.gapHours(g), g.map(x => `${R.DS[x.dow]} ${R.fmt(x.from)}-${R.fmt(x.to)} -${x.missing}`).join(' | '));
  return entries;
}
const lb = ['Edu','Emi','Maia','Martu','Agus','Tomi','Gala'];
run('2026-12-21','LB',lb);
run('2026-12-21','LB',lb,[...lb].reverse());
run('2026-12-07','LB',['Edu','Emi','Maia']);
run('2026-12-14','LB',['Edu','Emi','Maia','Martu','Agus','Tomi','Gala']);
run('2027-01-04','KUL',['Isa','Meli','Gala']);
run('2027-01-11','KUL',['Isa','Meli']);
run('2026-12-21','KUL',['Isa','Meli']);
run('2026-11-16','LB',['Edu','Emi']);

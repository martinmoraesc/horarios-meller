// Configuración inicial: se guarda en la base la primera vez y después se edita desde el panel.
const wk = (open, close, mn, ideal = []) => ({ open, close, mn, ideal });
export const PERIODS_VERSION = 3;
export const DEFAULT_CFG = {
  periodsVersion: 3,
  locs: { LB: { name: 'La Barra' }, KUL: { name: 'Kul Store' } },
  rules: { minRest: 12, maxDay: 8, minShift: 4, maxDays: 6, minWeekendDays: 1 },
  periods: [
    { id: 'lb-nov', loc: 'LB', from: '2026-11-01', to: '2026-11-30', note: 'Horario actual',
      weekday: wk(10, 19, [[10, 19, 1]]), weekend: wk(10, 19, [[10, 19, 1]]) },
    { id: 'lb-dic1', loc: 'LB', from: '2026-12-01', to: '2026-12-11', note: 'Fines de semana hasta las 21',
      weekday: wk(10, 19, [[10, 15, 1], [15, 18, 2], [18, 19, 1]]),
      weekend: wk(10, 21, [[10, 14, 1], [14, 21, 2]]) },
    { id: 'lb-dic2', loc: 'LB', from: '2026-12-12', to: '2026-12-19', note: 'Se suma Martu; fines de semana hasta las 21',
      weekday: wk(10, 19, [[10, 13, 1], [13, 19, 2]]),
      weekend: wk(10, 21, [[10, 13, 1], [13, 17, 2], [17, 19, 3], [19, 21, 2]]) },
    { id: 'lb-pre', loc: 'LB', from: '2026-12-20', to: '2026-12-25', note: 'Hasta las 00:00 (a confirmar; si no, se pasa a 10–19 / finde 10–21)',
      weekday: wk(10, 24, [[10, 13, 2], [13, 17, 2], [17, 22, 3], [22, 24, 2]], [[17, 22, 4]]),
      weekend: wk(10, 24, [[10, 13, 2], [13, 17, 3], [17, 22, 4], [22, 24, 2]], [[17, 22, 5]]) },
    { id: 'lb-full', loc: 'LB', from: '2026-12-26', to: '2027-01-17', note: 'Todos los días de 10 a 00:00; sin día libre (descanso a compensar)', noDayOff: true,
      weekday: wk(10, 24, [[10, 13, 2], [13, 17, 2], [17, 22, 3], [22, 24, 2]], [[17, 22, 4]]),
      weekend: wk(10, 24, [[10, 13, 2], [13, 17, 3], [17, 22, 4], [22, 24, 2]], [[17, 22, 5]]) },
    { id: 'kul-dic1', loc: 'KUL', from: '2026-12-01', to: '2026-12-14', note: 'Kul 10 a 21',
      weekday: wk(10, 21, [[10, 21, 1]], [[17, 21, 2]]), weekend: wk(10, 21, [[10, 21, 1]], [[14, 21, 2]]) },
    { id: 'kul-full', loc: 'KUL', from: '2026-12-15', to: '2027-02-15', note: 'Kul 10 a 23 (a confirmar)',
      weekday: wk(10, 23, [[10, 23, 1]], [[17, 23, 2]]), weekend: wk(10, 23, [[10, 23, 1]], [[14, 23, 2]]) },
  ],
  people: {
    Edu: { locs: ['LB'], hours: 44, maxEnd: 19 },
    Emi: { locs: ['LB'], hours: 44 },
    Maia: { locs: ['LB'], hours: 44, from: '2026-12-01' },
    Martu: { locs: ['LB'], hours: 42, from: '2026-12-12' },
    Agus: { locs: ['LB'], hours: 42, from: '2026-12-16' },
    Tomi: { locs: ['LB'], hours: 42, from: '2026-12-16' },
    Gala: { locs: ['LB', 'KUL'], hours: 42, from: '2026-12-16' },
    Isa: { locs: ['KUL'], hours: 39, from: '2027-01-01' },
    Meli: { locs: ['KUL'], hours: 39, from: '2027-01-10' },
  },
};

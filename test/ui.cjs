const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:3000');
  await p.click('button[data-n="Emi"]'); await p.fill('#pin', '6142'); await p.click('#go');
  await p.waitForSelector('.weeknav');
  for (let i = 0; i < 5; i++) { await p.click('button[data-go=next]'); await p.waitForTimeout(250); }
  console.log('week', await p.textContent('.weeknav .t'));
  await p.screenshot({ path: 'test/s1.png' });
  await p.click('button[data-a=suggest]'); await p.waitForTimeout(300);
  console.log('alert', (await p.textContent('.card .alert') || '').slice(0, 120));
  await p.screenshot({ path: 'test/s2.png', fullPage: true });
  await p.click('button[data-a=confirm]'); await p.waitForTimeout(800);
  console.log('after confirm', await p.textContent('[data-a=confirm]'), '|', await p.textContent('#toast'));
  await p.click('button[data-t=team]'); await p.waitForTimeout(200);
  await p.screenshot({ path: 'test/s3.png' });
  console.log(errs.join('\n') || 'no js errors');
  await b.close();
})();

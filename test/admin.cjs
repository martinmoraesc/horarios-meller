const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 900, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3000');
  await p.click('#adm'); await p.fill('#pin', '9999'); await p.click('#go');
  await p.waitForSelector('h1:text("Panel")');
  for (let i = 0; i < 5; i++) { await p.click('button[data-go=next]'); await p.waitForTimeout(250); }
  await p.screenshot({ path: 'test/a1.png' });
  await p.click('button[data-at=team]'); await p.waitForSelector('#savecfg'); await p.screenshot({ path: 'test/a2.png' });
  await p.click('button[data-at=per]'); await p.waitForSelector('#saveper'); await p.click('#saveper'); await p.waitForTimeout(500);
  console.log('per toast:', await p.textContent('#toast'));
  await p.click('button[data-at=log]'); await p.waitForTimeout(400);
  console.log('log rows', await p.locator('tbody tr').count());
  console.log(errs.join('\n') || 'no js errors');
  await b.close();
})();

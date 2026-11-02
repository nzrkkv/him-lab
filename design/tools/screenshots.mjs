// Скриншоты макетов + автопроверки (горизонтальная прокрутка, цели касания < 44 px, обрезанный текст).
// Запуск: node design/tools/screenshots.mjs  (нужны playwright и Chrome: PLAYWRIGHT_MODULE, CHROME_PATH)
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs');
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['home', 'lesson', 'lab-sandbox', 'lab-mission', 'lab-result', 'lab-safety-stop'];
const sizes = [[1440, 900], [1024, 768], [768, 1024]];
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--allow-file-access-from-files'] });
const report = [];
for (const [w, h] of sizes) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  for (const name of pages) {
    await p.goto(`file://${dir}/mockups/${name}.html`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
    const out = `${dir}/screenshots/${name}-${w}x${h}.png`;
    await p.screenshot({ path: out });
    // проверки: горизонтальный скролл, текст, вылезающий из контейнера, мелкие цели касания
    const r = await p.evaluate(() => {
      const issues = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('hscroll ' + document.documentElement.scrollWidth);
      for (const el of document.querySelectorAll('button, a, [role=switch], [role=tab]')) {
        const rc = el.getBoundingClientRect();
        if (rc.width === 0 || getComputedStyle(el).visibility === 'hidden') continue;
        if (el.closest('[aria-hidden=true]') && !el.closest('.hl-lab')) continue;
        if (rc.height < 44 || rc.width < 44) issues.push(`small ${Math.round(rc.width)}x${Math.round(rc.height)} ${el.className} "${el.textContent.trim().slice(0,20)}"`);
      }
      for (const el of document.querySelectorAll('.hl-act span, .hl-btn, .hl-tab, .hl-substance__name, .hl-goal__title, .hl-dock__vessel span, .hl-topbar__title h1')) {
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') issues.push(`clip "${el.textContent.trim().slice(0,24)}"`);
      }
      return issues;
    });
    report.push(`${name} ${w}x${h}: ${r.length ? r.join(' | ') : 'ok'}`);
  }
  await ctx.close();
}
await b.close();
console.log(report.join('\n'));

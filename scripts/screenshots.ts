/**
 * Скриншоты работающего сайта для проверки вехи: npx tsx scripts/screenshots.ts [url]
 * Сценарии: главная, песочница (сода + уксус, капуста), миссия (подсказка, опыт), остановка опыта.
 * Браузер: CHROME_PATH или Chromium Playwright. Результат — screenshots/*.png (в git не попадает).
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4173/';
const out = 'screenshots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(
  process.env['CHROME_PATH'] ? { executablePath: process.env['CHROME_PATH'] } : {},
);

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
}

for (const [w, hgt] of [
  [1440, 900],
  [1024, 768],
] as const) {
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base);
  await shot(page, `home-${w}`);

  await page.goto(`${base}#/lab`);
  await page
    .getByRole('button', { name: /Закрыть|Понятно/ })
    .first()
    .click()
    .catch(() => undefined);
  await page.getByRole('listitem', { name: /Стакан/ }).click();
  await page.getByRole('button', { name: /^Сода/ }).click();
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.getByRole('listitem', { name: /Стакан/ }).click();
  await page.getByRole('button', { name: /^Отвар капусты/ }).click();
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.locator('[data-vessel="v1"]').click();
  await page.getByRole('button', { name: /^Уксус/ }).click();
  await page.getByRole('button', { name: 'Добавить' }).click();
  await shot(page, `sandbox-${w}`);

  await page.goto(`${base}#/lab/mission/powder-mystery`);
  await page
    .getByRole('button', { name: 'Начинаем!' })
    .click()
    .catch(() => undefined);
  await page.getByRole('button', { name: /Пипа, помоги/ }).click();
  await shot(page, `mission-hint-${w}`);
  await page.locator('[data-vessel="v2"]').click();
  await page.getByRole('button', { name: /^Банка Б/ }).click();
  await page.getByRole('button', { name: /^Вода/ }).click();
  await page.keyboard.press('m');
  await page.keyboard.press('m');
  await page.keyboard.press('m');
  await shot(page, `mission-water-${w}`);

  await page.locator('[data-vessel="v3"]').click();
  await page.getByRole('button', { name: /^Банка В/ }).click();
  await page.getByRole('button', { name: /^Раствор йода/ }).click();
  await page
    .getByRole('button', { name: 'Понятно' })
    .first()
    .click()
    .catch(() => undefined);
  await page.keyboard.press('d');
  await page.keyboard.press('h');
  await shot(page, `stop-${w}`);
  if (errors.length) console.log(`ошибки на ${w}:\n${errors.join('\n')}`);
  await ctx.close();
}
await browser.close();
console.log(`скриншоты: ${out}/`);

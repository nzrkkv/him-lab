/**
 * QA-проход по сценариям на трёх размерах: npx tsx scripts/qa.ts [url]
 * Проверяет: pageerror и ошибки консоли, не больше одного всплывающего слоя, кнопки в пределах экрана
 * (кроме прокручиваемой полки), горизонтальную прокрутку страницы. Скриншоты — screenshots/qa-*.png.
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { LAYER_CHECK } from '../tests/e2e/layers.ts';

const base = process.argv[2] ?? 'http://localhost:4173/';
const out = 'screenshots';
mkdirSync(out, { recursive: true });
const problems: string[] = [];

async function check(page: Page, where: string, shot?: string): Promise<void> {
  await page.waitForTimeout(250);
  const issues = (await page.evaluate(LAYER_CHECK)) as string[];
  for (const i of issues) problems.push(`${where}: ${i}`);
  if (shot) await page.screenshot({ path: `${out}/qa-${shot}.png` });
}

const browser = await chromium.launch(
  process.env['CHROME_PATH'] ? { executablePath: process.env['CHROME_PATH'] } : {},
);
for (const [w, hgt] of [
  [1440, 900],
  [1024, 768],
  [768, 1024],
] as const) {
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, hasTouch: w < 1100 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${w}: pageerror ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`${w}: console ${m.text()}`));
  const sz = `${w}x${hgt}`;
  const runScenario = async (name: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (e) {
      problems.push(`${sz} ${name}: ${String((e as Error).message).split('\n')[0]}`);
      await page.screenshot({ path: `${out}/qa-fail-${name}-${w}.png` });
    }
  };

  await runScenario('home', async () => {
    await page.goto(base);
    await check(page, `${sz} главная`, `home-${w}`);
  });

  await runScenario('sandbox', async () => {
    await page.goto(`${base}#/lab`);
    await check(page, `${sz} песочница пустая`, `sandbox-empty-${w}`);
    await page.getByRole('listitem', { name: /Стакан/ }).click();
    await page.getByRole('button', { name: /^Сода/ }).click();
    await check(page, `${sz} поповер количества`, `sandbox-qty-${w}`);
    await page.getByRole('button', { name: 'Добавить' }).click();
    await page.getByRole('button', { name: /^Уксус/ }).click();
    await page.getByRole('button', { name: 'Добавить' }).click();
    await check(page, `${sz} результат`, `sandbox-result-${w}`);
    await page.keyboard.press('l');
    await check(page, `${sz} лупа на жидкости`);
    await page.keyboard.press('p');
    await check(page, `${sz} pH`, `sandbox-ph-${w}`);
    const toggle = page.getByRole('button', { name: 'Журнал' });
    if (await toggle.isVisible()) {
      await toggle.click();
      await check(page, `${sz} журнал`, `sandbox-journal-${w}`);
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: /^Раствор йода/ }).click();
    await page.getByRole('button', { name: 'Добавить' }).click();
    await page.keyboard.press('h');
    await check(page, `${sz} нагрев`, `sandbox-heat-${w}`);
  });

  await runScenario('mission', async () => {
    await ctx.clearCookies();
    await page.goto(`${base}#/lab/mission/powder-mystery`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await check(page, `${sz} вступление`, `mission-intro-${w}`);
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Дальше' }).click();
    await page.getByRole('button', { name: 'Начинаем!' }).click();
    await page.locator('[data-vessel="v1"]').click();
    await page.getByRole('button', { name: /^Банка А/ }).click();
    await page.getByRole('button', { name: /^Вода/ }).click();
    for (let i = 0; i < 3; i++) await page.keyboard.press('m');
    await check(page, `${sz} результат миссии`, `mission-result-${w}`);
    await page.getByRole('button', { name: /Пипа, помоги/ }).click();
    await check(page, `${sz} подсказка`, `mission-hint-${w}`);
    await page.keyboard.press('l');
    await check(page, `${sz} лупа на растворе`);
    const toggle = page.getByRole('button', { name: 'Детективная доска' });
    if (await toggle.isVisible()) await toggle.click();
    await check(page, `${sz} доска`, `mission-board-${w}`);
    await page.getByRole('button', { name: /^Надпись для банки А/ }).click();
    await check(page, `${sz} выбор надписи`, `mission-label-${w}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Мел', exact: true }).click();
    await check(page, `${sz} после надписи`, `mission-after-label-${w}`);
    await page.getByRole('button', { name: 'Проверить' }).last().click();
    await check(page, `${sz} проверка`, `mission-check-${w}`);
  });
  await ctx.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'QA: замечаний нет');
console.log(`скриншоты: ${out}/qa-*.png`);
if (problems.length) process.exitCode = 1;

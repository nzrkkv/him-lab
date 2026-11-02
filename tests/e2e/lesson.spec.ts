/**
 * e2e: урок 1 целиком по данным контента — крючок, разминка, разбираемся, пропуск, миссия, тест, дома, награда.
 * На каждом экране: нет pageerror, не больше одного всплывающего слоя, кнопки в пределах экрана.
 * SHOTS=1 — сохранить скриншоты экранов в screenshots/.
 */
import { expect, test, type Page } from 'playwright/test';
import { compileContent } from '../../scripts/content/compile.ts';
import type { Lesson } from '../../src/core/content-model/types.ts';
import { LAYER_CHECK } from './layers.ts';

const bundle = compileContent('ru').bundle;
const lesson = bundle?.lessons.find((l) => l.id === 'm1_l01') as Lesson;
const names: Record<string, string> = {
  table_salt: 'Соль',
  sugar: 'Сахар',
  baking_soda: 'Сода',
  starch: 'Крахмал',
  chalk: 'Мел',
};

async function sortCards(
  page: Page,
  cards: { label: string; shelf: string }[],
  shelves: { id: string; label: string }[],
): Promise<void> {
  for (const c of cards) {
    await page.getByRole('button', { name: c.label, exact: true }).click();
    const shelf = shelves.find((s) => s.id === c.shelf)?.label ?? '';
    await page.getByRole('button', { name: `Положить на полку «${shelf}»` }).click();
  }
}

async function completeMission(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Открыть миссию' }).click();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Начинаем!' }).click();
  await page.waitForTimeout(600);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('himlab:test:progress') ?? '{}'));
  const toggle = page.getByRole('button', { name: 'Детективная доска' });
  if (await toggle.isVisible()) await toggle.click();
  for (const [letter, substance] of Object.entries(saved.mission.jarSubstance as Record<string, string>)) {
    await page.getByRole('button', { name: new RegExp(`^Надпись для банки ${letter}`) }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: names[substance] ?? '', exact: true })
      .click();
  }
  await page.getByRole('button', { name: 'Проверить' }).last().click();
  await page.getByRole('button', { name: 'Помыть руки' }).click();
  await page.getByRole('link', { name: 'Вернуться к уроку' }).click();
}

async function solveTest(page: Page): Promise<void> {
  for (const q of lesson.test.questions) {
    await expect(page.locator('.app-test__q')).toHaveText(q.prompt);
    if (q.type === 'single' || q.type === 'predict') {
      // Сначала неверный ответ: должно появиться объяснение, потом верный.
      const wrong = q.options.find((o) => !o.correct);
      if (wrong) {
        await page.getByRole('button', { name: wrong.label }).click();
        await expect(page.locator('.ls-verdict')).toContainText(wrong.explain);
      }
      await page.getByRole('button', { name: q.options.find((o) => o.correct)?.label ?? '' }).click();
    } else if (q.type === 'multi') {
      for (const o of q.options.filter((x) => x.correct))
        await page.getByRole('button', { name: o.label }).click();
      await page.getByRole('button', { name: 'Проверить' }).click();
    } else if (q.type === 'sort') {
      await sortCards(page, q.cards, q.shelves);
    } else {
      for (const p of q.pairs) {
        await page.getByRole('button', { name: p.left, exact: true }).click();
        await page.getByRole('button', { name: p.right, exact: true }).click();
      }
    }
    expect(await page.evaluate(LAYER_CHECK)).toEqual([]);
    await page.locator('.app-test__next').click();
  }
}

test('урок 1 проходится целиком', async ({ page }, info) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/lesson/m1-l01');
  for (const [i, sc] of lesson.screens.entries()) {
    await expect(page.locator('.ls-bench__head h2')).toHaveText(sc.title);
    const next = page.locator('.ls-next .hl-btn--primary');
    if (sc.blocks.some((b) => !['jars', 'rule', 'home', 'reward'].includes(b.type))) {
      await expect(next).toHaveAttribute('aria-disabled', 'true');
    }
    for (const type of ['goggles', 'predict', 'lab', 'sort', 'choice', 'spot', 'mission', 'test']) {
      for (const b of sc.blocks.filter((x) => x.type === type)) {
        if (b.type === 'goggles') await page.getByRole('button', { name: 'Надеть очки' }).click();
        if (b.type === 'predict')
          await page.getByRole('button', { name: b.options[1]?.label ?? '', exact: true }).click();
        if (b.type === 'lab')
          for (const a of b.actions) await page.getByRole('button', { name: a.label }).click();
        if (b.type === 'sort') await sortCards(page, b.cards, b.shelves);
        if (b.type === 'choice') {
          const right = b.options.find((o) => o.correct) ?? b.options[0];
          await page.getByRole('button', { name: right?.label ?? '', exact: true }).click();
        }
        if (b.type === 'spot')
          for (const c of b.cards.filter((x) => x.mistake))
            await page.getByRole('button', { name: c.label, exact: true }).click();
        if (b.type === 'mission') await completeMission(page);
        if (b.type === 'test') await solveTest(page);
      }
    }
    expect(await page.evaluate(LAYER_CHECK)).toEqual([]);
    if (process.env['SHOTS'])
      await page.screenshot({
        path: `screenshots/lesson-${String(i).padStart(2, '0')}-${sc.id}-${info.project.name}.png`,
        fullPage: true,
      });
    if (i < lesson.screens.length - 1) {
      await expect(next).toHaveAttribute('aria-disabled', 'false');
      await next.click();
    }
  }
  await expect(page.getByRole('heading', { name: lesson.reward.title })).toBeVisible();
  await page.waitForTimeout(800);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('himlab:test:progress') ?? '{}'));
  expect(saved.lessons.m1_l01.completed).toBe(true);
  expect(saved.badges).toEqual(
    expect.arrayContaining(['first-experiment', 'safety-pro', 'powder-detective', 'observer']),
  );
  // После урока в песочнице открылись новые вещества.
  await page.goto('/#/lab');
  await expect(page.getByRole('button', { name: /^Сода/ })).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Урок пройден')).toBeVisible();
  expect(errors).toEqual([]);
});

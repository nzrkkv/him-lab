/** e2e прототипа: главная, песочница, миссия «Загадка белых порошков», безопасность, приватность. */
import { expect, test, type Page } from 'playwright/test';

/** На планшете доска в выезжающей панели: открыть её кнопкой в верхней панели. */
async function openBoard(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Детективная доска' });
  if (await toggle.isVisible()) await toggle.click();
}

async function noExternalRequests(page: Page): Promise<string[]> {
  const external: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname !== 'localhost' && u.protocol !== 'data:') external.push(r.url());
  });
  return external;
}

test('главная открывается без ошибок и без сторонних запросов', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const external = await noExternalRequests(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Загадка белых порошков/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Песочница/ })).toBeVisible();
  await page.goto('/#/lab');
  await page.goto('/#/lab/mission/powder-mystery');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('песочница: сода + уксус — шипение и объяснение (тап-тап)', async ({ page }) => {
  await page.goto('/#/lab');
  await page.getByRole('listitem', { name: /Пробирка/ }).click();
  await page.getByRole('button', { name: /^Сода/ }).click();
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.getByRole('button', { name: /^Уксус/ }).click();
  await page.getByRole('button', { name: 'Добавить' }).click();
  await expect(page.getByRole('heading', { name: /Шипение/ })).toBeVisible();
  await expect(page.locator('#journal')).toContainText('Шипение');
});

test('песочница: соль + уксус — «ничего не произошло» с причиной', async ({ page }) => {
  await page.goto('/#/lab');
  await page.getByRole('listitem', { name: /Стакан/ }).click();
  await page.getByRole('button', { name: /^Соль/ }).click();
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.getByRole('button', { name: /^Уксус/ }).click();
  await page.getByRole('button', { name: 'Добавить' }).click();
  await expect(page.getByRole('heading', { name: 'Ничего не произошло' })).toBeVisible();
  await expect(page.locator('.hl-result__text')).toContainText('Соль с уксусом не реагирует');
});

test('безопасность: пробирку без держателя не греем, сухой йод не греем', async ({ page }) => {
  await page.goto('/#/lab/mission/powder-mystery');
  await page.getByRole('button', { name: 'Начинаем!' }).click();
  await page.locator('[data-vessel="v1"]').click();
  await page.getByRole('button', { name: /^Банка А/ }).click();
  await page.keyboard.press('h');
  await expect(page.getByText(/только держателем/)).toBeVisible();
  await page.getByRole('button', { name: /^Раствор йода/ }).click();
  await page.keyboard.press('d');
  await page.keyboard.press('h');
  await expect(page.getByRole('alertdialog')).toContainText('Йод так не нагреваем');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Понятно' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('миссия: опыты попадают на доску, надписи, проверка, мытьё рук, итог', async ({ page }) => {
  await page.goto('/#/lab/mission/powder-mystery');
  await page.getByRole('button', { name: 'Начинаем!' }).click();
  // Перетаскиванием: банка А → пробирка 1, затем вода и перемешивание с клавиатуры.
  const jar = page.getByRole('button', { name: /^Банка А/ });
  const tube = page.locator('[data-vessel="v1"]');
  await jar.hover();
  await page.mouse.down();
  const box = await tube.boundingBox();
  if (!box) throw new Error('нет пробирки');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await tube.click();
  await page.getByRole('button', { name: /^Вода/ }).click();
  for (let i = 0; i < 3; i++) await page.keyboard.press('m');
  await expect(page.locator('.hl-grid td.r').first()).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('himlab:test:progress') ?? '{}'));
  const jarSubstance = saved.mission.jarSubstance as Record<string, string>;
  await openBoard(page);
  const names: Record<string, string> = {
    table_salt: 'Соль',
    sugar: 'Сахар',
    baking_soda: 'Сода',
    starch: 'Крахмал',
    chalk: 'Мел',
  };
  for (const [letter, substance] of Object.entries(jarSubstance)) {
    await page.getByRole('button', { name: new RegExp(`^Надпись для банки ${letter}`) }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: names[substance] ?? '', exact: true })
      .click();
  }
  await page.getByRole('button', { name: 'Проверить' }).last().click();
  await expect(page.getByText(/Все банки подписаны/)).toBeVisible();
  await page.getByRole('button', { name: 'Помыть руки' }).click();
  await expect(page.getByRole('heading', { name: 'Твои доказательства' })).toBeVisible();
});

test('прогресс миссии переживает перезагрузку', async ({ page }) => {
  await page.goto('/#/lab/mission/powder-mystery');
  await page.getByRole('button', { name: 'Начинаем!' }).click();
  await openBoard(page);
  await page.getByRole('button', { name: /^Надпись для банки А/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Мел', exact: true }).click();
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Банка А, надпись: мел/ })).toBeVisible();
});

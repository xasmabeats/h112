import { test, expect } from '@playwright/test';
import { openSection } from './navigation';

test('selects the metadata beat after a delayed React route transition', async ({ page }) => {
  // Reproduce a busy CI browser: defer React's MessageChannel render tasks,
  // without delaying DOM events or changing application code/data/assertions.
  await page.addInitScript(() => {
    const browser = window as Window & { xasmaTestDeferRender?: boolean };
    const postMessage = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (...args) {
      if (browser.xasmaTestDeferRender && args[0] === null) {
        setTimeout(() => Reflect.apply(postMessage, this, args), 300);
      } else {
        Reflect.apply(postMessage, this, args);
      }
    };
  });

  await page.goto('./');
  await page.getByRole('link', { name: 'New beat', exact: true }).click();
  await page.getByLabel('Beat title *').fill('Midnight Protocol');
  await page.getByLabel('Artist references').fill('Chosen Artist');
  await page.getByRole('button', { name: 'Save beat', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Beat library', exact: true })).toBeVisible();
  await openSection(page, 'Release Calendar', 'Release calendar');
  await page.getByLabel('Beat', { exact: true }).selectOption({ label: 'Midnight Protocol' });

  await page.evaluate(() => {
    (window as Window & { xasmaTestDeferRender: boolean }).xasmaTestDeferRender = true;
  });
  await openSection(page, 'YouTube Metadata', 'YouTube metadata');
  await page.evaluate(() => {
    (window as Window & { xasmaTestDeferRender: boolean }).xasmaTestDeferRender = false;
  });
  const beat = page.getByRole('combobox', { name: 'Beat', exact: true });
  await beat.selectOption({ label: 'Midnight Protocol' });
  await expect(beat.locator('option:checked')).toHaveText('Midnight Protocol');
  await expect(page.getByLabel('YouTube video title', { exact: true })).toHaveValue(
    /Chosen Artist/,
  );
  await expect(
    page.getByRole('textbox', { name: 'YouTube video title', exact: true }),
  ).toBeVisible();
});

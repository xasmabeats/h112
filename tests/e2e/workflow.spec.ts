import { test, expect } from '@playwright/test';
test('complete local release workflow, backups, mobile and offline', async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Studio overview' })).toBeVisible();
  await page.getByRole('link', { name: 'New beat', exact: true }).click();
  await page.getByLabel('Beat title *').fill('Midnight Protocol');
  await page.getByLabel('BPM *').fill('148');
  await page.getByLabel('Musical key').fill('F# minor');
  await page.getByLabel('Artist references').fill('Chosen Artist');
  await page.getByLabel('Mood', { exact: true }).fill('Cold');
  await page.getByRole('button', { name: 'Save beat', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Beat library' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Midnight Protocol', { exact: true })).toBeVisible();
  await page.getByLabel('Edit Midnight Protocol').click();
  await page.reload();
  await expect(page.getByLabel('Beat title *')).toHaveValue('Midnight Protocol');
  await page.getByLabel('Production notes').fill('Tighten the 808 tail');
  await page.getByRole('button', { name: 'Save beat', exact: true }).click();
  await page.getByLabel('Search beats').fill('absent');
  await expect(page.getByText('No matching beats')).toBeVisible();
  await page.getByLabel('Search beats').fill('');
  await page.getByLabel('Filter genre').selectOption('Supertrap');
  await expect(page.getByText('No matching beats')).toBeVisible();
  await page.getByLabel('Filter genre').selectOption('');
  await page.getByRole('link', { name: 'Release Pipeline', exact: true }).click();
  await page.getByLabel('Status for Midnight Protocol').selectOption('Ready');
  await expect(page.getByLabel('Status for Midnight Protocol')).toHaveValue('Ready');
  await page.getByRole('link', { name: 'Release Calendar', exact: true }).click();
  await page.getByLabel('Release date', { exact: true }).fill('2027-01-15');
  await page.getByLabel('Beat', { exact: true }).selectOption({ label: 'Midnight Protocol' });
  await page.getByRole('button', { name: 'Assign / reschedule' }).click();
  await expect(page.getByText('Release date saved', { exact: true })).toBeVisible();
  await page.getByLabel('Release date', { exact: true }).fill('2027-01-22');
  await page.getByRole('button', { name: 'Assign / reschedule' }).click();
  await expect(page.getByText('2027-01-22', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'YouTube Metadata', exact: true }).click();
  await page.getByLabel('Beat', { exact: true }).selectOption({ label: 'Midnight Protocol' });
  await expect(page.getByLabel('YouTube video title', { exact: true })).toHaveValue(
    /Chosen Artist/,
  );
  await page.getByLabel('YouTube video title', { exact: true }).fill('Manual release title');
  await page.getByRole('button', { name: 'Save to beat' }).click();
  await expect(page.getByRole('status')).toContainText('Metadata saved');
  await page.reload();
  await page.getByLabel('Beat', { exact: true }).selectOption({ label: 'Midnight Protocol' });
  await expect(page.getByLabel('YouTube video title', { exact: true })).toHaveValue(
    'Manual release title',
  );
  await page.getByRole('link', { name: 'Settings & Backups', exact: true }).click();
  await page.getByLabel('Producer display name').fill('XASMA TEST');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all data' }).click();
  const backup = await downloadPromise;
  const backupPath = await backup.path();
  expect(backupPath).toBeTruthy();
  await page.getByRole('link', { name: 'Beat Library', exact: true }).click();
  await page.getByLabel('Duplicate Midnight Protocol').click();
  await expect(page.getByText('Midnight Protocol (copy)', { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Delete Midnight Protocol', { exact: true }).click();
  await expect(page.getByText('Midnight Protocol', { exact: true })).not.toBeVisible();
  await page.getByRole('link', { name: 'Settings & Backups', exact: true }).click();
  await page.getByLabel('Import backup file').setInputFiles(backupPath!);
  await expect(page.getByText('Validated backup')).toBeVisible();
  await page.getByLabel('Import mode').selectOption('replace');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page.getByText('Backup restored', { exact: true })).toBeVisible();
  await page.getByLabel('Import backup file').setInputFiles({
    name: 'corrupted.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":1}'),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('link', { name: 'Beat Library', exact: true }).click();
  await expect(page.getByText('Midnight Protocol', { exact: true })).toBeVisible();
  await expect(page.getByText('Midnight Protocol (copy)', { exact: true })).not.toBeVisible();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByText('Welcome back, XASMA TEST. Keep the sound moving.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Beat Library', exact: true }).click();
  await expect(page.getByText('Midnight Protocol', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Midnight Protocol', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Studio overview' })).toBeVisible();
  await page.getByRole('link', { name: 'New beat', exact: true }).click();
  await page.getByLabel('Beat title *').fill('Offline session');
  await page.getByRole('button', { name: 'Save beat', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Beat library' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Offline session', { exact: true })).toBeVisible();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
test('manifest and assets resolve below a repository subpath', async ({ request }) => {
  const manifest = await request.get('manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  const data = await manifest.json();
  expect(data.start_url).toBe('/h112/');
  expect(data.scope).toBe('/h112/');
  for (const icon of data.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('image/png');
  }
  expect((await request.get('sw.js')).ok()).toBeTruthy();
});
test('template management and unsaved beat navigation protection', async ({ page }) => {
  await page.goto('./#/templates');
  await page.getByRole('button', { name: 'New template', exact: true }).click();
  await page.getByLabel('Template name').fill('My release pattern');
  await page.getByLabel('Template content').fill('{beatTitle} | {producer} {year}');
  await page.getByLabel('Use as default for this type').check();
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My release pattern' })).toBeVisible();
  await page.getByRole('button', { name: 'Duplicate My release pattern', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My release pattern (copy)' })).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete My release pattern (copy)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My release pattern (copy)' })).not.toBeVisible();
  await page
    .getByRole('button', { name: 'My release pattern', exact: false })
    .filter({ has: page.getByRole('heading', { name: 'My release pattern', exact: true }) })
    .click();
  await page.getByLabel('Template content').fill('EDITED {beatTitle}');
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  // Reload only after the IndexedDB transaction completes and the editor closes.
  await expect(page.getByRole('button', { name: 'Save template', exact: true })).not.toBeVisible();
  await expect(page.getByText('EDITED {beatTitle}', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('EDITED {beatTitle}', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Beat Library', exact: true }).click();
  await page.getByRole('link', { name: 'New beat', exact: true }).click();
  await page.getByLabel('Beat title *').fill('Unsaved idea');
  const dismiss = page.waitForEvent('dialog').then((d) => d.dismiss());
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await dismiss;
  await expect(page.getByLabel('Beat title *')).toHaveValue('Unsaved idea');
  const accept = page.waitForEvent('dialog').then((d) => d.accept());
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await accept;
  await expect(page.getByRole('heading', { name: 'Studio overview' })).toBeVisible();
});
test('all primary sections fit a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const route of [
    '',
    'beats',
    'beats/new',
    'calendar',
    'pipeline',
    'metadata',
    'templates',
    'settings',
  ]) {
    await page.goto(`./#/${route}`);
    await expect(page.locator('main h1')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `overflow in ${route}`,
    ).toBeTruthy();
  }
});

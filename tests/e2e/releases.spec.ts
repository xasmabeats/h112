import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openSection } from './navigation';

test('migrates v1 JSON, retains manual metadata and prepares an offline web release without native tools', async ({
  page,
  context,
}) => {
  const metadata = {
    title: 'My manually written legacy title',
    description: 'Keep this description',
    tags: 'drill, cold',
    hashtags: '#drill',
    filename: 'legacy.wav',
    pinnedComment: 'My comment',
  };
  const beat = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Legacy v1 fixture',
    genre: 'Drill',
    bpm: 140,
    key: 'D minor',
    mood: 'Cold',
    artists: 'Chosen Artist',
    tags: ['cold'],
    productionNotes: 'Keep my notes',
    customNotes: '',
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    status: 'Mixing',
    plannedDate: '2027-02-03',
    actualDate: '',
    youtubeUrl: '',
    artwork: 'old-cover.png',
    metadata,
  };
  const legacy = {
    schemaVersion: 1,
    exportedAt: '2026-01-01T12:00:00.000Z',
    attachments: 'not-supported',
    beats: [beat],
    templates: [
      {
        id: 'legacy-title',
        name: 'Legacy title',
        kind: 'title',
        content: '{beatTitle} | {artists}',
        isDefault: true,
      },
    ],
    settings: [
      {
        id: 'preferences',
        producer: 'Legacy producer',
        defaultGenre: 'Drill',
        defaultTemplate: '',
        schedule: '',
        contact: '',
        socials: '',
        licensing: '',
        appearance: 'comfortable',
      },
    ],
  };
  await page.goto('./#/settings');
  await page.getByLabel('Import backup file').setInputFiles({
    name: 'genuine-v1.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.getByText('Validated backup', { exact: true })).toBeVisible();
  await page.getByLabel('Import mode').selectOption('replace');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Confirm import', exact: true }).click();
  await expect(page.getByText('Backup restored', { exact: true })).toBeVisible();
  await openSection(page, 'Beat Library', 'Beat library');
  await page.getByLabel('Edit Legacy v1 fixture').click();
  await expect(page.getByLabel('Production notes')).toHaveValue('Keep my notes');
  await expect(page.getByLabel('Planned release date')).toHaveValue('2027-02-03');
  await page.getByRole('link', { name: 'Release studio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Release studio', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Release beat', exact: true })).toHaveValue(
    beat.id,
  );
  await expect(page.getByRole('button', { name: 'Import audio', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Import artwork', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'New release draft' }).click();
  await expect(page.getByRole('heading', { name: 'Release preparation' })).toBeVisible();
  await page.getByText('Review metadata snapshot', { exact: true }).click();
  await expect(
    page.getByText(/My manually written legacy title\n\nKeep this description/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Mark Ready', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Audio, artwork and a metadata title are required',
  );
  await expect(page.getByRole('button', { name: 'Render new MP4 attempt' })).toBeDisabled();
  await openSection(page, 'Release History', 'Release history');
  await expect(page.getByText('release created', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('release created', { exact: true })).toBeVisible();
  await openSection(page, 'Settings & Backups', 'Settings & backups');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all data', exact: true }).click();
  const file = await download;
  const backup = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(backup.schemaVersion).toBe(2);
  expect(backup.attachments).toBe('references-only');
  expect(backup.beats[0].metadata).toEqual(metadata);
  expect(backup.beats[0].status).toBe('Mixing');
  expect(backup.releases).toHaveLength(1);
  expect(backup.media).toEqual([]);
  expect(backup.events.some((e: { type: string }) => e.type === 'release_created')).toBe(true);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await openSection(page, 'Release Studio', 'Release studio');
  await page.getByRole('combobox', { name: 'Release beat', exact: true }).selectOption(beat.id);
  await expect(page.getByRole('heading', { name: 'Release preparation' })).toBeVisible();
  await openSection(page, 'Release History', 'Release history');
  await expect(page.getByText('release created', { exact: true })).toBeVisible();
  await context.setOffline(false);
});

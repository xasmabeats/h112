import { expect, type Page } from '@playwright/test';

export async function openSection(page: Page, linkName: string, heading: string) {
  await page.getByRole('link', { name: linkName, exact: true }).click();
  // Hash history can change before React commits the new Outlet. Several screens
  // share labels (such as "Beat"), so URL/click completion alone is not readiness.
  await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
}

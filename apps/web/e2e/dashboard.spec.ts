import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/user.json' });

test.describe('Dashboard pages — empty state', () => {
  test('timeline shows empty state', async ({ page }) => {
    await page.goto('/timeline');
    await expect(page.getByText('No health records yet')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/timeline-empty.png', fullPage: true });
  });

  test('labs shows empty state', async ({ page }) => {
    await page.goto('/labs');
    await expect(page.getByText('No lab results yet')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/labs-empty.png', fullPage: true });
  });

  test('medications shows empty state', async ({ page }) => {
    await page.goto('/medications');
    await expect(page.getByText('No medications tracked yet')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/medications-empty.png', fullPage: true });
  });

  test('uploads page renders', async ({ page }) => {
    await page.goto('/uploads');
    await expect(page.getByText('Upload Documents')).toBeVisible();
    await expect(page.getByText('Drop files here')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/uploads.png', fullPage: true });
  });

  test('sharing shows empty state', async ({ page }) => {
    await page.goto('/sharing');
    await expect(page.getByText("You haven't shared any data yet")).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/sharing-empty.png', fullPage: true });
  });

  test('settings loads user preferences', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByLabel('Timezone')).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel('Preferred Units')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/settings.png', fullPage: true });
  });
});

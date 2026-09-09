import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/user.json' });

test.describe('Settings flow', () => {
  test('can change timezone and save', async ({ page }) => {
    await page.goto('/settings');

    // Change timezone
    const timezoneSelect = page.getByLabel('Timezone');
    await expect(timezoneSelect).toBeVisible({ timeout: 10000 });
    await timezoneSelect.selectOption('America/New_York');

    // Change units
    const unitsSelect = page.getByLabel('Preferred Units');
    await unitsSelect.selectOption('imperial');

    // Save
    await page.getByRole('button', { name: 'Save preferences' }).click();

    // Wait for success toast
    await expect(page.getByText('Preferences saved')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'e2e/screenshots/settings-saved.png', fullPage: true });

    // Reload and verify persisted
    await page.reload();
    await expect(page.getByLabel('Timezone')).toHaveValue('America/New_York');
    await expect(page.getByLabel('Preferred Units')).toHaveValue('imperial');
  });
});

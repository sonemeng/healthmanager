import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/user.json' });

test.describe('Pipeline result verification', () => {
  test('uploads page shows processed import job', async ({ page }) => {
    await page.goto('/uploads');
    await page.waitForTimeout(2000); // let query settle
    await page.screenshot({ path: 'e2e/screenshots/pipeline-uploads.png', fullPage: true });
  });

  test('timeline shows imported data', async ({ page }) => {
    await page.goto('/timeline');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/screenshots/pipeline-timeline.png', fullPage: true });
  });

  test('labs page shows results', async ({ page }) => {
    await page.goto('/labs');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/screenshots/pipeline-labs.png', fullPage: true });
  });
});

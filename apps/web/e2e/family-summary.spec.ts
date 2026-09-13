import { expect, test } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/user.json' });

test.describe('Family summary', () => {
  test('separates health records from basic-profile completeness', async ({ page }) => {
    await page.goto('/family');
    await expect(page.getByRole('heading', { name: '家庭健康概览' })).toBeVisible({ timeout: 10000 });

    const profileCards = page.locator('button.card');
    await expect(profileCards).not.toHaveCount(0);

    const count = await profileCards.count();
    for (let index = 0; index < count; index++) {
      await expect(profileCards.nth(index)).toContainText('健康记录');
      await expect(profileCards.nth(index)).toContainText('基础资料完整度');
    }
  });
});

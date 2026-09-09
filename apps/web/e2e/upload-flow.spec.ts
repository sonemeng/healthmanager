import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/user.json' });

const TEST_PDF = '/Users/claudius/Downloads/MyChart - Test Details.pdf';

test.describe('Upload flow', () => {
  test('upload a PDF document and see it in recent imports', async ({ page }) => {
    await page.goto('/uploads');
    await expect(page.getByText('Upload Documents')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/uploads-before.png', fullPage: true });

    // Use file chooser to upload the PDF
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_PDF);

    // File should appear in the queued files list
    await expect(page.getByText('MyChart - Test Details.pdf')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/uploads-queued.png', fullPage: true });

    // Click upload button
    const uploadButton = page.getByRole('button', { name: /Upload 1 file/ });
    await expect(uploadButton).toBeVisible();
    await uploadButton.click();

    // Wait for upload to complete — the queue should clear
    // Either the upload succeeds (queue clears, file appears in imports)
    // or it fails (error message appears)
    const success = page.locator('text="No imports yet"').or(page.locator('text="MyChart"').last());
    const errorBanner = page.locator('[class*="critical"]');

    // Wait for either the upload button to disappear (success) or an error to show
    await Promise.race([
      expect(page.getByRole('button', { name: /Uploading/ })).not.toBeVisible({ timeout: 20000 }),
      expect(errorBanner).toBeVisible({ timeout: 20000 }),
    ]).catch(() => {});

    await page.screenshot({ path: 'e2e/screenshots/uploads-after.png', fullPage: true });

    // Check if there's an error
    const hasError = await errorBanner.isVisible().catch(() => false);
    if (hasError) {
      const errorText = await errorBanner.textContent();
      console.log(`Upload error: ${errorText}`);
    }

    // The import should appear in the "Recent imports" section
    const recentImportsSection = page.locator('text="Recent imports"').locator('..');
    await expect(
      recentImportsSection.getByText('MyChart - Test Details.pdf'),
    ).toBeVisible({ timeout: 10000 });
  });
});

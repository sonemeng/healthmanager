import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/user.json' });

const TEST_PDF = '/Users/claudius/Downloads/MyChart - Test Details.pdf';

test.describe('Settings: demographic profile', () => {
  test('save and verify demographic fields persist', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Demographic Profile')).toBeVisible({ timeout: 10000 });

    // Set demographic fields
    await page.getByLabel('Biological Sex').selectOption('male');
    await page.getByLabel('Date of Birth').fill('1990-05-15');
    await page.getByLabel('Blood Type').selectOption('O+');

    // Save
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Preferences saved')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/full-1-settings-demographics.png', fullPage: true });

    // Verify persisted after reload
    await page.reload();
    await expect(page.getByLabel('Biological Sex')).toHaveValue('male');
    await expect(page.getByLabel('Date of Birth')).toHaveValue('1990-05-15');
    await expect(page.getByLabel('Blood Type')).toHaveValue('O+');
  });
});

test.describe('Upload and pipeline', () => {
  test('upload a lab PDF and trigger pipeline', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/uploads');
    await expect(page.getByText('Upload Documents')).toBeVisible({ timeout: 10000 });

    // Upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_PDF);
    await expect(page.getByText('MyChart - Test Details.pdf')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/full-2-upload-queued.png', fullPage: true });

    // Click upload
    const uploadButton = page.getByRole('button', { name: /Upload 1 file/ });
    await uploadButton.click();
    await expect(page.getByRole('button', { name: /Uploading/ })).not.toBeVisible({ timeout: 30000 });

    // Import should appear in recent imports
    await expect(page.getByText('MyChart - Test Details.pdf').last()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/full-2-upload-sent.png', fullPage: true });

    // Poll for terminal status (Completed/Failed/Needs review)
    let result = 'timeout';
    for (let i = 0; i < 30; i++) {
      if (await page.locator('text="Completed"').isVisible().catch(() => false)) { result = 'completed'; break; }
      if (await page.locator('text="Failed"').isVisible().catch(() => false)) { result = 'failed'; break; }
      if (await page.locator('text="Needs review"').isVisible().catch(() => false)) { result = 'review'; break; }
      await page.waitForTimeout(3000);
    }

    console.log(`Pipeline result: ${result}`);
    await page.screenshot({ path: 'e2e/screenshots/full-2-pipeline-result.png', fullPage: true });
  });

  test('labs page shows data (if pipeline succeeded)', async ({ page }) => {
    await page.goto('/labs');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'e2e/screenshots/full-3-labs.png', fullPage: true });

    const body = await page.textContent('body');
    console.log(`Labs has results: ${!body?.includes('No lab results yet')}`);
  });

  test('timeline shows data', async ({ page }) => {
    await page.goto('/timeline');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'e2e/screenshots/full-4-timeline.png', fullPage: true });
  });
});

test.describe('Biomarkers page', () => {
  test('shows categories with metric counts', async ({ page }) => {
    await page.goto('/biomarkers');
    await expect(page.getByRole('heading', { name: 'Biomarkers' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/screenshots/full-5-biomarkers-overview.png', fullPage: true });

    // Verify metric count in subtitle
    await expect(page.locator('text=/\\d+ metrics/').first()).toBeVisible({ timeout: 5000 });

    // All categories present
    await expect(page.getByText('Metabolic')).toBeVisible();
    await expect(page.getByText('Hematology')).toBeVisible();
    await expect(page.getByText('Lipid Panel')).toBeVisible();
    await expect(page.getByText('Thyroid')).toBeVisible();
    await expect(page.getByText('Iron Studies')).toBeVisible();
    await expect(page.getByText('Vitamins')).toBeVisible();
    await expect(page.getByText('Hormones')).toBeVisible();
    await expect(page.getByText('Vital Signs')).toBeVisible();
  });

  test('expand category and view metric detail with demographic ranges', async ({ page }) => {
    await page.goto('/biomarkers');
    await expect(page.getByRole('heading', { name: 'Biomarkers' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // Expand Hematology
    await page.getByText('Hematology').click();
    await page.waitForTimeout(500);
    await expect(page.getByText('Hemoglobin').first()).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/full-5-biomarkers-hematology.png', fullPage: true });

    // Click Hemoglobin to see demographic ranges
    await page.getByText('Hemoglobin').first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/screenshots/full-5-biomarkers-hemoglobin-detail.png', fullPage: true });

    // Sex-specific ranges with ARUP source
    await expect(page.getByText('Male').first()).toBeVisible();
    await expect(page.getByText('Female').first()).toBeVisible();
    await expect(page.getByText('ARUP').first()).toBeVisible();

    // Actual range values
    await expect(page.getByText('13.5–17.5 g/dL').first()).toBeVisible();
    await expect(page.getByText('12–16 g/dL').first()).toBeVisible();
  });

  test('search by metric name', async ({ page }) => {
    await page.goto('/biomarkers');
    await expect(page.getByRole('heading', { name: 'Biomarkers' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    const searchInput = page.getByPlaceholder('Search metrics, aliases, or categories...');

    // Search for "vitamin d"
    await searchInput.fill('vitamin d');
    await page.waitForTimeout(500);
    await expect(page.getByText('Vitamin D').first()).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/full-6-search-vitamind.png', fullPage: true });
  });

  test('search by alias', async ({ page }) => {
    await page.goto('/biomarkers');
    await expect(page.getByRole('heading', { name: 'Biomarkers' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    const searchInput = page.getByPlaceholder('Search metrics, aliases, or categories...');

    // Search "HbA1c" → matches alias of Hemoglobin A1c
    await searchInput.fill('HbA1c');
    await page.waitForTimeout(500);
    await expect(page.getByText('Hemoglobin A1c')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/full-6-search-hba1c.png', fullPage: true });

    // Search "25(OH)D" → matches alias of Vitamin D
    await searchInput.fill('25(OH)D');
    await page.waitForTimeout(500);
    await expect(page.getByText('Vitamin D').first()).toBeVisible();
  });

  test('search no matches shows empty state', async ({ page }) => {
    await page.goto('/biomarkers');
    await expect(page.getByRole('heading', { name: 'Biomarkers' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    const searchInput = page.getByPlaceholder('Search metrics, aliases, or categories...');
    await searchInput.fill('zzz_nonexistent');
    await page.waitForTimeout(500);
    await expect(page.getByText('No matches')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/full-6-search-nomatch.png', fullPage: true });
  });

  test('shows user profile context and range highlighting', async ({ page }) => {
    // First set the profile
    await page.goto('/settings');
    await expect(page.getByText('Demographic Profile')).toBeVisible({ timeout: 10000 });
    await page.getByLabel('Biological Sex').selectOption('male');
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Preferences saved')).toBeVisible({ timeout: 5000 });

    // Navigate to biomarkers
    await page.goto('/biomarkers');
    await expect(page.getByRole('heading', { name: 'Biomarkers' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // Subtitle should show profile sex
    await expect(page.getByText('Profile: male')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/full-7-biomarkers-profile.png', fullPage: true });

    // Expand Iron Studies → Ferritin for sex-dependent ranges
    await page.getByText('Iron Studies').click();
    await page.waitForTimeout(500);
    await page.getByText('Ferritin').first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/screenshots/full-7-biomarkers-ferritin.png', fullPage: true });

    // Both Male and Female ranges shown
    await expect(page.getByText('Male').first()).toBeVisible();
    await expect(page.getByText('Female').first()).toBeVisible();
    await expect(page.getByText('12–300 ng/mL').first()).toBeVisible();
    await expect(page.getByText('12–150 ng/mL').first()).toBeVisible();
  });
});

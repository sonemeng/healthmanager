import { test as setup, expect } from '@playwright/test';

const AUTH_FILE = 'e2e/.auth/user.json';

setup('register and authenticate', async ({ page }) => {
  setup.setTimeout(60_000);

  const uniqueId = Date.now();
  const email = `test-${uniqueId}@openvitals.dev`;
  const password = 'TestPassword123!';

  // Go to register page
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

  // Fill registration form
  await page.getByLabel('Name').fill('Test User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  // New users redirect to /onboarding
  await page.waitForURL('**/onboarding', { timeout: 15000 });

  // Step 0: Welcome
  await expect(page.getByRole('button', { name: /get started/i })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /get started/i }).click();
  await page.waitForTimeout(300);

  // Step 1: About You — fill required fields
  await expect(page.getByText('About you')).toBeVisible({ timeout: 5000 });
  await page.locator('input[placeholder="First"]').fill('Test');
  await page.locator('input[placeholder="Last"]').fill('User');
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByRole('button', { name: /continue/i }).click();
  await page.waitForTimeout(300);

  // Step 2: Goals — select one reason to enable Continue
  await expect(page.getByText('Step 2 of 7')).toBeVisible({ timeout: 5000 });
  await page.getByText('Understand my lab results').click();
  await page.getByRole('button', { name: /continue/i }).click();
  await page.waitForTimeout(300);

  // Steps 3–7: Skip through each
  for (let i = 3; i <= 7; i++) {
    await expect(page.getByText(`Step ${i} of 7`)).toBeVisible({ timeout: 5000 });
    const skipBtn = page.getByRole('button', { name: /skip for now/i });
    await skipBtn.click();
    await page.waitForTimeout(300);
  }

  // Step 8: Complete — click "Go to your dashboard"
  await expect(page.getByText("You're all set")).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Go to your dashboard' }).click();

  // Should arrive at /timeline
  await page.waitForURL('**/timeline', { timeout: 10000 });

  // Save auth state for reuse across tests
  await page.context().storageState({ path: AUTH_FILE });
});

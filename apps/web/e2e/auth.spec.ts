import { test, expect } from '@playwright/test';

test.describe('Auth pages', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/login.png', fullPage: true });
  });

  test('register page renders', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/register.png', fullPage: true });
  });

  test('login link navigates to register', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Sign up' }).click();
    await expect(page).toHaveURL('/register');
  });

  test('register link navigates to login', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('link', { name: 'Log in' }).click();
    await expect(page).toHaveURL('/login');
  });
});

/**
 * Trainr E2E Test Helpers
 * Shared utilities for Playwright browser tests
 */
import { Page, expect } from '@playwright/test';

export const TEST_ACCOUNTS = {
  parent: {
    email: 'jennifer.davis@email.com',
    password: 'Parent123!',
    role: 'PARENT',
  },
  trainer: {
    email: 'marcus.johnson@email.com',
    password: 'Trainer123!',
    role: 'TRAINER',
  },
  admin: {
    email: 'admin@trainr.app',
    password: 'Admin123!',
    role: 'ADMIN',
  },
} as const;

/**
 * Log in via the NextAuth credentials provider.
 * Uses the signin page form, not API calls, to test real browser flow.
 */
export async function loginAs(page: Page, role: 'parent' | 'trainer' | 'admin') {
  const account = TEST_ACCOUNTS[role]
  await page.goto('/auth/signin')
  await page.waitForLoadState('networkidle')

  await page.getByLabel(/email/i).fill(account.email)
  await page.getByLabel(/password/i).fill(account.password)

  const submitBtn = page.locator('main button[type="submit"]').first()
  await Promise.all([
    page.waitForURL(/^(?!.*\/auth\/signin).+$/, { timeout: 20000 }),
    submitBtn.click(),
  ])
}

/**
 * Register a new user via the signup form.
 */
export async function registerUser(page: Page, data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'PARENT' | 'TRAINER';
}) {
  await page.goto('/auth/signup');
  await page.waitForLoadState('networkidle');

  await page.locator('input[name="firstName"], input[placeholder*="First"]').first().fill(data.firstName);
  await page.locator('input[name="lastName"], input[placeholder*="Last"]').first().fill(data.lastName);
  await page.locator('input[type="email"], input[name="email"]').first().fill(data.email);
  await page.locator('input[type="password"]').first().fill(data.password);
  
  // Select role if there's a role selector
  const roleSelect = page.locator('select[name="role"], [data-testid="role-select"]').first();
  if (await roleSelect.isVisible().catch(() => false)) {
    await roleSelect.selectOption(data.role);
  }

  // Confirm password if field exists
  const confirmInput = page.locator('input[name="confirmPassword"], input[placeholder*="Confirm"]').first();
  if (await confirmInput.isVisible().catch(() => false)) {
    await confirmInput.fill(data.password);
  }

  // Agree to terms if checkbox exists
  const termsCheckbox = page.locator('input[name="agreeToTerms"], input[type="checkbox"]').first();
  if (await termsCheckbox.isVisible().catch(() => false)) {
    await termsCheckbox.check();
  }

  await page.locator('button[type="submit"]').first().click();
}

/**
 * Assert that the current page is a specific route or pattern.
 */
export async function expectOnPage(page: Page, pathPattern: string | RegExp) {
  if (typeof pathPattern === 'string') {
    await expect(page).toHaveURL(new RegExp(pathPattern.replace('/', '\\/')));
  } else {
    await expect(page).toHaveURL(pathPattern);
  }
}

/**
 * Assert that the user is redirected away from a protected route.
 */
export async function expectRedirectedFrom(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  // Should NOT still be on the target path
  const current = page.url();
  return !current.includes(path);
}

/**
 * Dismiss any modals/toasts that might block interactions.
 */
export async function dismissModals(page: Page) {
  const closeButtons = page.locator('button[aria-label="Close"], button:has-text("Dismiss"), [data-dismiss="modal"]');
  const count = await closeButtons.count();
  for (let i = 0; i < count; i++) {
    await closeButtons.nth(i).click().catch(() => {});
  }
}

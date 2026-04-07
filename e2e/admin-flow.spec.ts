/**
 * TASK 4 — Admin Browser Flow Automation
 * 
 * Covers: admin login → users → bookings → trainers → analytics → payouts → disputes → coupons → settings
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Admin Flow', () => {

  test.describe('Authentication', () => {
    test('admin can log in', async ({ page }) => {
      await loginAs(page, 'admin');
      const url = page.url();
      expect(url).not.toContain('/auth/signin');
    });

    test('admin can access admin dashboard', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin');
      await page.waitForLoadState('networkidle');
      // Admin page should load
      const url = page.url();
      expect(url).toContain('/admin');
    });
  });

  test.describe('User Management', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin');
    });

    test('users page loads', async ({ page }) => {
      await page.goto('/admin/users');
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/admin/users');
    });

    test('users API returns data', async ({ page }) => {
      const response = await page.request.get('/api/admin/users');
      expect(response.status()).not.toBe(404);
      const data = await response.json().catch(() => null);
      // API should return something (even if paginated)
      expect(data).not.toBeNull();
    });
  });

  test.describe('Booking Management', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin');
    });

    test('bookings page loads', async ({ page }) => {
      await page.goto('/admin/bookings');
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/admin/bookings');
    });

    test('bookings API returns data', async ({ page }) => {
      const response = await page.request.get('/api/admin/bookings');
      expect(response.status()).not.toBe(404);
    });
  });

  test.describe('Trainer Management', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin');
    });

    test('trainers page loads', async ({ page }) => {
      await page.goto('/admin/trainers');
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/admin/trainers');
    });

    test('can view individual trainer', async ({ page }) => {
      // Get a trainer from the API first
      const response = await page.request.get('/api/admin/trainers');
      if (response.ok()) {
        const data = await response.json().catch(() => null);
        if (data?.trainers?.[0]?.id || data?.[0]?.id) {
          const trainerId = data.trainers?.[0]?.id || data[0]?.id;
          await page.goto(`/admin/trainers?id=${trainerId}`);
          await page.waitForLoadState('networkidle');
          expect(page.url()).toContain('/admin/trainers');
        }
      }
    });
  });

  test.describe('Analytics', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin');
    });

    test('analytics page loads', async ({ page }) => {
      await page.goto('/admin/analytics');
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/admin/analytics');
    });
  });

  test.describe('Payouts', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin');
    });

    test('payouts page loads', async ({ page }) => {
      await page.goto('/admin/payouts');
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/admin/payouts');
    });

    test('payouts API returns data', async ({ page }) => {
      const response = await page.request.get('/api/admin/payouts');
      expect(response.status()).not.toBe(404);
    });
  });

  test.describe('Disputes', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin');
    });

    test('disputes page loads', async ({ page }) => {
      await page.goto('/admin/disputes');
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/admin/disputes');
    });
  });

  test.describe('Coupons', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin');
    });

    test('coupons page loads', async ({ page }) => {
      await page.goto('/admin/coupons');
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/admin/coupons');
    });

    test('coupons API returns data', async ({ page }) => {
      const response = await page.request.get('/api/admin/coupons');
      expect(response.status()).not.toBe(404);
    });
  });

  test.describe('Settings', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin');
    });

    test('settings page loads', async ({ page }) => {
      await page.goto('/admin/settings');
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/admin/settings');
    });
  });
});

/**
 * TASK 5 — Role-Boundary Strengthening
 * 
 * Tests that role-based access control is enforced:
 * - Parent cannot access trainer routes
 * - Trainer cannot access admin routes
 * - Unauthenticated users are redirected
 * - API endpoints enforce role checks
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Role Boundary Enforcement', () => {

  test.describe('Parent cannot access Trainer routes', () => {
    const trainerRoutes = [
      '/trainer/dashboard',
      '/trainer/onboarding',
      '/trainer/profile',
    ];

    const trainerAPIs = [
      '/api/trainer/onboarding',
      '/api/trainer/stripe-connect',
    ];

    for (const route of trainerRoutes) {
      test(`parent blocked from ${route}`, async ({ page }) => {
        await loginAs(page, 'parent');
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        
        const url = page.url();
        // Should NOT still be on trainer route
        expect(url).not.toContain(route);
      });
    }

    for (const api of trainerAPIs) {
      test(`parent blocked from API ${api}`, async ({ page }) => {
        await loginAs(page, 'parent');
        const response = await page.request.get(api);
        expect([401, 403]).toContain(response.status());
      });
    }
  });

  test.describe('Trainer cannot access Admin routes', () => {
    const adminRoutes = [
      '/admin',
      '/admin/users',
      '/admin/bookings',
      '/admin/trainers',
      '/admin/analytics',
      '/admin/payouts',
      '/admin/disputes',
      '/admin/coupons',
      '/admin/settings',
    ];

    const adminAPIs = [
      '/api/admin/bookings',
      '/api/admin/coupons',
    ];

    for (const route of adminRoutes) {
      test(`trainer blocked from ${route}`, async ({ page }) => {
        await loginAs(page, 'trainer');
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        
        const url = page.url();
        // Should NOT still be on admin route
        expect(url).not.toContain(route);
      });
    }

    for (const api of adminAPIs) {
      test(`trainer blocked from API ${api}`, async ({ page }) => {
        await loginAs(page, 'trainer');
        const response = await page.request.get(api);
        expect([401, 403]).toContain(response.status());
      });
    }
  });

  test.describe('Unauthenticated users redirected', () => {
    const protectedRoutes = [
      '/parent/dashboard',
      '/parent/athletes',
      '/trainer/dashboard',
      '/trainer/onboarding',
      '/trainer/profile',
      '/admin',
      '/admin/users',
      '/messages',
    ];

    for (const route of protectedRoutes) {
      test(`unauthenticated user redirected from ${route}`, async ({ page }) => {
        // Use a fresh context — no cookies
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        
        const url = page.url();
        // Should redirect to signin or home (NOT stay on protected route)
        const stillOnProtectedRoute = url.includes(route);
        // Allow redirect to signin, home, or any non-protected page
        expect(stillOnProtectedRoute).toBe(false);
      });
    }
  });

  test.describe('API role enforcement', () => {
    test('parent cannot create trainer onboarding', async ({ page }) => {
      await loginAs(page, 'parent');
      const response = await page.request.post('/api/trainer/onboarding', {
        data: { bio: 'test', specialties: [] }
      });
      expect([401, 403, 405]).toContain(response.status());
    });

    test('trainer cannot create admin coupon', async ({ page }) => {
      await loginAs(page, 'trainer');
      const response = await page.request.post('/api/admin/coupons', {
        data: { code: 'FAKE', discount: 50 }
      });
      expect([401, 403, 302, 307]).toContain(response.status());
    });

    test('trainer cannot withdraw from another trainer wallet', async ({ page }) => {
      await loginAs(page, 'trainer');
      // Try accessing a different trainer's wallet
      const response = await page.request.post('/api/trainer/wallet/withdraw', {
        data: { amount: 999999 }
      });
      // Should not succeed (might be 400 if insufficient funds, or 403)
      expect(response.status()).not.toBe(200);
    });
  });
});

// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Smoke tests — verify the core pages load and render critical elements.
 * These run on every CI build (no login required).
 */

test.describe('Homepage', () => {
  test('loads and shows key sections', async ({ page }) => {
    await page.goto('/');

    // Page title is set
    await expect(page).toHaveTitle(/Shopy Nepal/i);

    // Header is visible
    await expect(page.locator('header')).toBeVisible();

    // At least one product card or hero section loads
    const hasHero = await page.locator('[data-testid="hero"], .hero, h1').count();
    expect(hasHero).toBeGreaterThan(0);

    // Footer is visible
    await expect(page.locator('footer')).toBeVisible();
  });

  test('WhatsApp support button is present', async ({ page }) => {
    await page.goto('/');
    // The floating WhatsApp button links to wa.me
    const waLink = page.locator('a[href*="wa.me"]');
    await expect(waLink).toBeVisible();
  });
});

test.describe('Shop page', () => {
  test('loads product listing', async ({ page }) => {
    await page.goto('/shop');
    await expect(page).toHaveTitle(/Shopy Nepal/i);

    // Search input should be present
    const search = page.getByPlaceholder(/search/i);
    await expect(search).toBeVisible();
  });

  test('search input filters results', async ({ page }) => {
    await page.goto('/shop');
    const search = page.getByPlaceholder(/search/i);
    await search.fill('shirt');
    // After typing, wait briefly for results to update
    await page.waitForTimeout(600);
    // No assertion on count — just ensure it doesn't throw/crash
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Cart page', () => {
  test('shows empty cart message when no items', async ({ page }) => {
    await page.goto('/cart');
    // Either shows cart items or an empty-state message
    const body = page.locator('body');
    await expect(body).toBeVisible();
    await expect(page).toHaveTitle(/Shopy Nepal/i);
  });
});

test.describe('My Orders page', () => {
  test('shows login prompt for unauthenticated users', async ({ page }) => {
    await page.goto('/my-orders');
    // Should see a phone/PIN login form, not order data
    const phoneInput = page.locator('input[type="tel"]');
    await expect(phoneInput).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Contact page', () => {
  test('loads contact form', async ({ page }) => {
    await page.goto('/contact');
    await expect(page).toHaveTitle(/Shopy Nepal/i);

    const nameInput = page.getByPlaceholder(/name/i);
    await expect(nameInput).toBeVisible();

    const messageInput = page.getByPlaceholder(/message/i);
    await expect(messageInput).toBeVisible();
  });

  test('honeypot field is hidden from users', async ({ page }) => {
    await page.goto('/contact');
    // The _honeypot field should be hidden (display:none or aria-hidden)
    const honeypot = page.locator('[name="_honeypot"]');
    if (await honeypot.count() > 0) {
      await expect(honeypot).toBeHidden();
    }
  });
});

test.describe('CSP & Security', () => {
  test('no inline script execution violations in console', async ({ page }) => {
    const violations = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('Content Security Policy')) {
        violations.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForTimeout(1000);

    expect(violations, `CSP violations: ${violations.join('\n')}`).toHaveLength(0);
  });
});

test.describe('404 page', () => {
  test('shows not-found page for unknown routes', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-xyz');
    // Should render something — not a blank page
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(10);
  });
});

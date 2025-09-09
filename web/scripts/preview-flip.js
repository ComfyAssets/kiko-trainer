const { chromium } = require('@playwright/test');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const base = process.env.BASE_URL || 'http://localhost:5173';
  await page.goto(base, { waitUntil: 'domcontentloaded' });

  // Click Training tab
  await page.getByRole('button', { name: 'Training' }).click();

  // Ensure advanced mode by selecting 'Advanced' if the mode select exists
  const maybeMode = page.getByRole('combobox');
  if (await maybeMode.count()) {
    // Try to select 'Advanced' option if not already
    try { await maybeMode.selectOption('advanced'); } catch {}
  }

  // Scroll to the switch region and wait for it
  await page.locator('#flip-symmetry').scrollIntoViewIfNeeded().catch(()=>{});
  await page.waitForTimeout(300);

  // Verify switch is present by role/name
  const flipSwitch = page.getByRole('switch', { name: 'Horizontal flip' });
  if (!(await flipSwitch.count())) {
    console.warn('Flip switch not found by role+name; falling back to id');
  }

  // Take screenshot of the section
  const target = (await flipSwitch.count()) ? flipSwitch : page.locator('#flip-symmetry');
  await target.first().screenshot({ path: 'web/playwright-output/flip-switch.png' }).catch(async () => {
    // fallback to full page screenshot if sub-screenshot fails
    await page.screenshot({ path: 'web/playwright-output/flip-switch-fullpage.png', fullPage: true });
  });

  await browser.close();
})();

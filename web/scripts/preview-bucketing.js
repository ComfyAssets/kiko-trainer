const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
  await page.goto(base, { waitUntil: 'domcontentloaded' });

  // Go to Training tab
  await page.getByRole('button', { name: 'Training' }).click();

  // Switch to Advanced mode if not already
  const mode = page.getByRole('combobox');
  if (await mode.count()) {
    try { await mode.selectOption('advanced'); } catch {}
  }

  // Ensure the bucketing section is visible
  await page.getByText('Augmentations & Bucketing').scrollIntoViewIfNeeded().catch(()=>{});
  await page.waitForTimeout(100);
  await page.getByText('Aspect ratio bucketing').scrollIntoViewIfNeeded().catch(()=>{});

  // Take a screenshot of the bucketing block
  const group = page.getByText('Augmentations & Bucketing').locator('..').locator('..');
  await group.screenshot({ path: 'web/playwright-output/advanced-bucketing.png' }).catch(async () => {
    await page.screenshot({ path: 'web/playwright-output/advanced-bucketing-full.png', fullPage: true });
  });

  await browser.close();
})();

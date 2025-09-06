import { test, expect } from '@playwright/test'

// Launch dev server via webServer in config, navigate to app and verify the switch

test('Flip switch is present and toggles', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Training' }).click()

  // Ensure advanced mode selected
  const mode = page.getByRole('combobox')
  if (await mode.count()) {
    try { await mode.selectOption('advanced') } catch {}
  }

  // Find the switch by its role and accessible name
  const sw = page.getByRole('switch', { name: 'Horizontal flip' })
  await expect(sw).toBeVisible()

  // Toggle it
  const before = await sw.getAttribute('aria-pressed')
  await sw.click()
  const after = await sw.getAttribute('aria-pressed')
  expect(before).not.toBe(after)
})

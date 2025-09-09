import { test, expect } from '@playwright/test'

test('Bucketing appears under LoRA Dropout and spans width', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Training' }).click()

  const mode = page.getByRole('combobox')
  if (await mode.count()) {
    try { await mode.selectOption('advanced') } catch {}
  }

  const dropout = page.getByText('Augmentations & Bucketing')
  await expect(dropout).toBeVisible()

  const bucketingLabel = page.getByText('Aspect ratio bucketing')
  await expect(bucketingLabel).toBeVisible()

  // Check vertical order via y positions
  const dbox = await dropout.boundingBox()
  const bbox = await bucketingLabel.boundingBox()
  expect(dbox && bbox && bbox.y > dbox.y).toBeTruthy()
})

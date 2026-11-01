// End-to-end smoke test: launches the built app (run `electron-vite build` first).
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(__dirname, '..')
let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  // Fresh profile so the test never touches the user's library or settings.
  const userData = mkdtempSync(join(tmpdir(), 'outis-e2e-'))
  app = await electron.launch({
    args: [join(root, 'out/main/index.js'), `--user-data-dir=${userData}`],
    cwd: root
  })
  page = await app.firstWindow()
  await page.waitForSelector('text=Anonymise a file')
})

test.afterAll(async () => {
  await app?.close()
})

/** Make the next native "open file" dialog return this path. */
async function mockOpenDialog(path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [p]
    })) as typeof dialog.showOpenDialog
  }, path)
}

test('anonymises a CSV file and shows the changes', async () => {
  await page.click('text=Anonymise a file')
  await mockOpenDialog(join(root, 'samples/customers.csv'))
  await page.click('text=Choose a file…')
  await expect(page.locator('text=customers.csv')).toBeVisible()
  await expect(page.locator('text=rule(s) active')).toBeVisible()

  await page.click('text=Anonymise →')
  await expect(page.locator('text=values changed')).toBeVisible({ timeout: 60_000 })
  const changed = Number(
    (await page.locator('.summary .stat b').first().innerText()).replace(/,/g, '')
  )
  expect(changed).toBeGreaterThan(20)

  // Original names should appear struck through in the inline diff.
  await expect(page.locator('del.diff', { hasText: 'Sarah' }).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/csv-review.png' })
})

test('anonymises a JSON file by property path', async () => {
  await page.click('text=Close file')
  await mockOpenDialog(join(root, 'samples/orders.json'))
  await page.click('text=Choose a file…')
  await expect(page.locator('text=orders.json')).toBeVisible()
  await page.click('text=Anonymise →')
  await expect(page.locator('text=values changed')).toBeVisible({ timeout: 60_000 })
  await expect(
    page.locator('.json-diff .diff-del', { hasText: 'sarah.jenkins@gmail.com' }).first()
  ).toBeVisible()
  await page.screenshot({ path: 'test-results/json-review.png' })
})

test('finds PII in free text', async () => {
  await page.click('.nav-item:has-text("Text")')
  await page.click('text=Try a sample')
  await page.click('text=Find PII →')
  await expect(page.locator('mark', { hasText: 'sarah.jenkins@gmail.com' }).first()).toBeVisible({
    timeout: 60_000
  })
  await expect(page.locator('mark', { hasText: 'AB 12 34 56 C' }).first()).toBeVisible()
  await expect(page.locator('mark', { hasText: 'Sarah Jenkins' }).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/text-review.png' })
})

test('makes no network requests', async () => {
  const log = await page.evaluate(() => window.outis.networkLog())
  expect(log).toEqual([])
})

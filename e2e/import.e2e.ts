// Import a PNG and an H.264/AAC MP4 through OpenCut's own Import button on the acdev runtime; record every toast.
import { test, expect } from 'acdev/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.env.SMOKE_OUT ?? join(import.meta.dir, '..', '.acde', 'smoke')
const MEDIA = process.env.SMOKE_MEDIA ?? join(import.meta.dir, 'fixtures')
const TAG = process.env.SMOKE_TAG ?? 'import'
const log: Record<string, unknown> = {}
mkdirSync(OUT, { recursive: true })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('opencut import', async ({ app, acde }) => {
  await wait(3000)
  await app!.evaluate<void>(`document.querySelector('a[href="/projects"]')?.click()`)
  await wait(3000)
  await app!.getByRole('button', { name: /New project/ }).first().click()
  await wait(6000)
  await app!.keyboard.press('Escape')
  await wait(800)
  // Collect toasts as they appear (sonner removes them after ~4 s).
  await app!.evaluate<void>(`window.__toasts = []; new MutationObserver(() => { for (const t of document.querySelectorAll('[data-sonner-toast]')) { const s = t.innerText.trim(); if (s && !window.__toasts.includes(s)) window.__toasts.push(s) } }).observe(document.body, { subtree: true, childList: true, characterData: true })`)
  for (const [name, file] of [['image', 'red.png'], ['video', 'h264_aac.mp4']]) {
    await acde.chooseFiles([join(MEDIA, file)])
    await app!.getByRole('button', { name: /^Import$/ }).first().click()
    await wait(7000)
    log[`${name}Toasts`] = await app!.evaluate<string[]>('window.__toasts.slice()')
    log[`${name}Assets`] = (await app!.evaluate<string>(`document.body.innerText`)).split('\n').slice(0, 12)
    await app!.screenshot({ path: join(OUT, `${TAG}-${name}.png`) })
  }
  log.console = (await app!.console({ limit: 300 })).entries
  writeFileSync(join(OUT, `${TAG}-result.json`), JSON.stringify(log, null, 2))
  expect(true).toBe(true)
})

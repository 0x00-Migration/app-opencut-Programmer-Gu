// Drag and drop from the system on the acde runtime (docs D10): files over 64 MiB are not in dataTransfer.files
// there. Drops SMOKE_BIG (a video over 64 MiB; local only, not in the repo) onto the Media panel's drop zone and
// onto the timeline, and records toasts, assets and tracks. Results go to build/smoke/drop-*.
// Run: SMOKE_BIG=/path/to/big.mp4 scripts/acdev.sh test e2e/drop.e2e.ts
import { test, expect } from 'acdev/test'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.env.SMOKE_OUT ?? join(import.meta.dir, '..', 'build', 'smoke')
const BIG = process.env.SMOKE_BIG ?? ''
mkdirSync(OUT, { recursive: true })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('opencut drop', async ({ app, acde }) => {
  if (!BIG) { console.log('SMOKE_BIG not set: skipped'); return }
  const log: Record<string, unknown> = { file: BIG, bytes: statSync(BIG).size }
  await wait(3000)
  await app!.evaluate<void>(`document.querySelector('a[href="/projects"]')?.click()`)
  await wait(3000)
  await app!.getByRole('button', { name: /New project/ }).first().click()
  await wait(6000)
  await app!.keyboard.press('Escape')
  await wait(800)
  await app!.evaluate<void>(`window.__toasts = []; new MutationObserver(() => { for (const t of document.querySelectorAll('[data-sonner-toast]')) { const s = t.innerText.trim(); if (s && !window.__toasts.includes(s)) window.__toasts.push(s) } }).observe(document.body, { subtree: true, childList: true, characterData: true })`)
  const web = await app!.web()
  const centre = (text: string) => `(() => { const el = [...document.querySelectorAll('*')].find(e => e.children.length < 3 && (e.textContent ?? '').trim().startsWith(${JSON.stringify(text)})); const r = (el ?? document.body).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`

  // 1. Onto the Media panel's drop zone.
  const zone = await app!.evaluate<{ x: number; y: number }>(centre('Drag and drop videos'))
  await acde.drop([BIG], { web, x: zone.x, y: zone.y })
  await wait(15000)
  log.panelToasts = await app!.evaluate<string[]>('window.__toasts.slice()')
  log.assets = await app!.evaluate<string[]>(`[...document.querySelectorAll('[title]')].map(e => e.getAttribute('title')).filter(t => /\\.mp4$/.test(t ?? ''))`)
  await app!.screenshot({ path: join(OUT, 'drop-1-panel.png') })

  // 2. Onto the timeline (empty track area below the ruler).
  const ruler = await app!.evaluate<{ x: number; y: number }>(`(() => { const el = document.querySelector('[aria-label="Timeline ruler"]'); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + 200), y: Math.round(r.y + r.height + 80) } })()`)
  await acde.drop([BIG], { web, x: ruler.x, y: ruler.y })
  await wait(15000)
  log.timelineToasts = await app!.evaluate<string[]>('window.__toasts.slice()')
  log.timelineElements = await app!.evaluate<string[]>(`[...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /big_100MB\\.mp4/.test(e.textContent ?? '')).map(e => e.textContent)`)
  await app!.screenshot({ path: join(OUT, 'drop-2-timeline.png') })
  log.errors = ((await app!.console({ limit: 300 })).entries as { level?: string; text?: string }[]).filter((e) => e.level === 'error').map((e) => String(e.text).slice(0, 300))
  writeFileSync(join(OUT, 'drop-result.json'), JSON.stringify(log, null, 2))
  expect(true).toBe(true)
})

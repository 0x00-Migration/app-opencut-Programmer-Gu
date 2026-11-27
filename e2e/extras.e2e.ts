// More editor features on the acde runtime: a sticker, "Save snapshot" from the preview's context menu (renders
// with renderToCanvas and saves through the save picker), and the Sounds tab (a Freesound search proxied by the
// app's server, which needs an API key). Results go to build/smoke/extras-*; the snapshot is kept as
// build/smoke/extras-snapshot.png.
import { test, expect } from 'acdev/test'
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.env.SMOKE_OUT ?? join(import.meta.dir, '..', 'build', 'smoke')
const MEDIA = process.env.SMOKE_MEDIA ?? join(import.meta.dir, 'fixtures')
mkdirSync(OUT, { recursive: true })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const tab = (name: string) => `(() => { const b = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').trim() === ${JSON.stringify(name)}); b?.click(); return b ? 'clicked' : 'none' })()`

test('opencut extras', async ({ app, acde, home }) => {
  const log: Record<string, unknown> = {}
  await wait(3000)
  await app!.evaluate<void>(`document.querySelector('a[href="/projects"]')?.click()`)
  await wait(3000)
  await app!.getByRole('button', { name: /New project/ }).first().click()
  await wait(6000)
  await app!.keyboard.press('Escape')
  await wait(800)
  await app!.evaluate<void>(`window.__toasts = []; new MutationObserver(() => { for (const t of document.querySelectorAll('[data-sonner-toast]')) { const s = t.innerText.trim(); if (s && !window.__toasts.includes(s)) window.__toasts.push(s) } }).observe(document.body, { subtree: true, childList: true, characterData: true })`)
  await acde.chooseFiles([join(MEDIA, 'h264_aac.mp4')])
  await app!.getByRole('button', { name: /^Import$/ }).first().click()
  await wait(7000)
  await app!.evaluate<string>(`(() => { const l = [...document.querySelectorAll('[title]')].find(e => e.getAttribute('title') === 'h264_aac.mp4'); const b = l?.closest('.group')?.querySelector('button'); b?.click(); return b ? 'clicked' : 'none' })()`)
  await wait(4000)

  // Sticker: open the tab and add the first sticker tile.
  log.stickersTab = await app!.evaluate<string>(tab('Stickers'))
  await wait(3000)
  // The "All" view starts empty (also in Chrome 158); open the Flags category.
  // Radix tabs switch on pointer down, so this needs a real click, not element.click().
  try { await app!.getByRole('tab', { name: 'Flags' }).click(); log.flagsTab = 'clicked' } catch (e) { log.flagsTab = String(e).slice(0, 200) }
  await wait(5000)
  log.stickerTiles = await app!.evaluate<number>(`document.querySelectorAll('.group button').length`)
  log.stickerAdded = await app!.evaluate<string>(`(() => { const b = document.querySelector('.group button'); if (!b) return 'none'; b.click(); return 'clicked ' + (b.closest('.group')?.getAttribute('title') ?? b.closest('.group')?.textContent?.trim().slice(0, 30) ?? '') })()`)
  await wait(4000)
  log.timelineLabels = await app!.evaluate<string[]>(`(() => { const lines = document.body.innerText.split('\\n').map(s => s.trim()).filter(Boolean); const i = lines.indexOf('Main scene'); return lines.slice(i + 1).filter(s => !/^\\d|^\\d+f$|^Ripple$|^Video$/.test(s)).slice(0, 10) })()`)
  await app!.screenshot({ path: join(OUT, 'extras-1-sticker.png') })

  // Save snapshot from the preview's context menu.
  const canvas = await app!.evaluate<{ x: number; y: number }>(`(() => { const c = [...document.querySelectorAll('canvas')].find((x) => x.width >= 1280); const r = c.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`)
  await acde.chooseSaveFile(join(home, 'snapshot.png'))
  await app!.mouse.click(canvas.x, canvas.y, { button: 'right' })
  await wait(1000)
  log.contextMenu = await app!.evaluate<string[]>(`[...document.querySelectorAll('[role=menuitem]')].map(e => e.textContent?.trim())`)
  log.saveSnapshot = await app!.evaluate<string>(`(() => { const m = [...document.querySelectorAll('[role=menuitem]')].find(e => e.textContent?.trim() === 'Save snapshot'); m?.click(); return m ? 'clicked' : 'none' })()`)
  await wait(4000)
  log.snapshotSaved = existsSync(join(home, 'snapshot.png')) ? statSync(join(home, 'snapshot.png')).size : 0
  if (log.snapshotSaved) copyFileSync(join(home, 'snapshot.png'), join(OUT, 'extras-snapshot.png'))

  // Sounds tab: the search goes through the app's /api/sounds/search, which needs a Freesound API key.
  log.soundsTab = await app!.evaluate<string>(tab('Sounds'))
  await wait(6000)
  log.soundsText = (await app!.evaluate<string>(`(() => { const lines = document.body.innerText.split('\\n').map(s => s.trim()).filter(Boolean); const i = lines.indexOf('Sounds'); return lines.slice(i, i + 12).join(' | ') })()`)).slice(0, 400)
  await app!.screenshot({ path: join(OUT, 'extras-2-sounds.png') })
  log.toasts = await app!.evaluate<string[]>('window.__toasts.slice()')
  log.errors = ((await app!.console({ limit: 300 })).entries as { level?: string; text?: string }[]).filter((e) => e.level === 'error').map((e) => String(e.text).slice(0, 300))
  log.failedRequests = ((await app!.network({ limit: 300, failed: true })).entries as { url?: string; status?: number }[]).map((e) => `${e.status ?? ''} ${String(e.url).slice(0, 120)}`)
  writeFileSync(join(OUT, 'extras-result.json'), JSON.stringify(log, null, 2))
  expect(true).toBe(true)
})

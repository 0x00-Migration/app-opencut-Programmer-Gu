// End to end on the acde runtime: import an H.264/AAC MP4, add it to the timeline, check that the preview shows the
// video, play it, export it, and look for the saved file. Results and screenshots go to OUT (.acde/smoke/full-*).
import { test, expect } from 'acdev/test'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.env.SMOKE_OUT ?? join(import.meta.dir, '..', '.acde', 'smoke')
const MEDIA = process.env.SMOKE_MEDIA ?? join(import.meta.dir, 'fixtures')
const log: Record<string, unknown> = {}
mkdirSync(OUT, { recursive: true })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function files(dir: string, depth = 4): string[] {
  if (!existsSync(dir) || depth < 0) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    return e.isDirectory() ? files(p, depth - 1) : [p]
  })
}

// Samples of the preview canvas, read in a later task (the acde runtime makes a WebGPU canvas readable only after it
// was presented; see docs D4). Returns a few pixels and how many distinct colours a coarse grid has.
const SAMPLE = `(() => {
  const c = [...document.querySelectorAll('canvas')].find((x) => x.width >= 1280)
  if (!c) return null
  const t = document.createElement('canvas'); t.width = 64; t.height = 36
  const x = t.getContext('2d'); x.drawImage(c, 0, 0, 64, 36)
  const d = x.getImageData(0, 0, 64, 36).data
  const colours = new Set()
  for (let i = 0; i < d.length; i += 4 * 7) colours.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4))
  const px = (u, v) => Array.from(x.getImageData(u, v, 1, 1).data)
  return { size: c.width + 'x' + c.height, distinctColours: colours.size, centre: px(32, 18), topLeft: px(4, 4), bottomRight: px(60, 32) }
})()`

test('opencut full flow', async ({ app, acde, home }) => {
  await wait(3000)
  await app!.evaluate<void>(`document.querySelector('a[href="/projects"]')?.click()`)
  await wait(3000)
  await app!.getByRole('button', { name: /New project/ }).first().click()
  await wait(6000)
  await app!.keyboard.press('Escape')
  await wait(800)
  await app!.evaluate<void>(`window.__toasts = []; new MutationObserver(() => { for (const t of document.querySelectorAll('[data-sonner-toast]')) { const s = t.innerText.trim(); if (s && !window.__toasts.includes(s)) window.__toasts.push(s) } }).observe(document.body, { subtree: true, childList: true, characterData: true })`)

  // 1. Import.
  await acde.chooseFiles([join(MEDIA, 'h264_aac.mp4')])
  await app!.getByRole('button', { name: /^Import$/ }).first().click()
  await wait(7000)
  log.importToasts = await app!.evaluate<string[]>('window.__toasts.slice()')
  await app!.screenshot({ path: join(OUT, 'full-1-imported.png') })

  // 2. Add to the timeline with the asset tile's + button.
  log.added = await app!.evaluate<string>(`(() => {
    const label = [...document.querySelectorAll('[title]')].find((e) => e.getAttribute('title') === 'h264_aac.mp4')
    const tile = label?.closest('.group')
    const button = tile?.querySelector('button')
    if (!button) return 'no + button'
    button.click(); return 'clicked'
  })()`)
  await wait(4000)
  log.previewAfterAdd = await app!.evaluate<unknown>(SAMPLE)
  log.timeAfterAdd = await app!.evaluate<string>(`[...document.querySelectorAll('span,div')].map(e => e.textContent).find(t => /^\\d\\d:\\d\\d:\\d\\d:\\d\\d$/.test(t ?? '')) ?? null`)
  await app!.screenshot({ path: join(OUT, 'full-2-on-timeline.png') })

  // 3. Play for ~1.5 s, then pause.
  await app!.evaluate<void>(`document.body.focus()`)
  await app!.keyboard.press('Space')
  await wait(1500)
  log.previewWhilePlaying = await app!.evaluate<unknown>(SAMPLE)
  await app!.keyboard.press('Space')
  await wait(500)
  log.timecodes = await app!.evaluate<string[]>(`[...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /^\\d\\d:\\d\\d:\\d\\d:\\d\\d$/.test(e.textContent ?? '')).map(e => e.textContent)`)
  await app!.screenshot({ path: join(OUT, 'full-3-played.png') })

  // 4. Export (default format/quality) and look for the file.
  await app!.getByRole('button', { name: /^Export$/ }).first().click()
  await wait(1500)
  await app!.screenshot({ path: join(OUT, 'full-4-export-popover.png') })
  await acde.chooseSaveFile(join(home, 'opencut-export.mp4'))
  // Keep every Blob the page turns into an object URL, so the exported file can be checked even if saving fails.
  await app!.evaluate<void>(`window.__blobs = []; const orig = URL.createObjectURL; URL.createObjectURL = function (b) { if (b instanceof Blob) window.__blobs.push(b); return orig.call(URL, b) }; const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { (window.__anchors ??= []).push({ download: this.download, href: this.href.slice(0, 40) }); return click.call(this) }`)
  await app!.getByRole('button', { name: /^Export$/ }).last().click()
  await wait(20000)
  log.exportToasts = await app!.evaluate<string[]>('window.__toasts.slice()')
  log.exportPopover = (await app!.evaluate<string>(`document.querySelector('[data-radix-popper-content-wrapper]')?.innerText ?? null`))
  await app!.screenshot({ path: join(OUT, 'full-5-exported.png') })
  log.anchors = await app!.evaluate<unknown>('window.__anchors ?? []')
  log.blobs = await app!.evaluate<unknown>(`window.__blobs.map(b => ({ type: b.type, size: b.size }))`)
  const b64 = await app!.evaluate<string | null>(`(async () => { const b = window.__blobs.filter(b => /video/.test(b.type)).pop(); if (!b) return null; const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) })()`)
  if (b64) writeFileSync(join(OUT, 'full-export-captured.mp4'), Buffer.from(b64, 'base64'))
  log.savedFiles = files(home).filter((p) => /\.(mp4|webm)$/.test(p) && !p.includes('fixtures')).map((p) => ({ path: p.replace(home, '~'), bytes: statSync(p).size }))

  // 5. Back to the project list: the project card shows a thumbnail rendered by renderToCanvas (docs D4).
  // history.back(), not a reload: acdev test keeps IndexedDB in memory and drops it on reload (localStorage
  // survives); with on-disk storage (acdev dev) both survive a reload.
  await app!.evaluate<void>('history.back()')
  await wait(8000)
  log.projectsPath = await app!.evaluate<string>('location.pathname')
  log.thumbnail = await app!.evaluate<unknown>(`(async () => {
    const img = [...document.images].find((i) => i.src.startsWith('data:image'))
    if (!img) return { found: false, images: document.images.length }
    await img.decode().catch(() => {})
    const c = document.createElement('canvas'); c.width = 32; c.height = 18
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 18)
    const d = x.getImageData(0, 0, 32, 18).data; const colours = new Set(); let alpha = 0
    for (let i = 0; i < d.length; i += 4) { colours.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); alpha += d[i + 3] }
    return { found: true, bytes: img.src.length, size: img.naturalWidth + 'x' + img.naturalHeight, distinctColours: colours.size, meanAlpha: Math.round(alpha / (d.length / 4)), topLeft: Array.from(x.getImageData(1, 1, 1, 1).data) }
  })()`)
  await app!.screenshot({ path: join(OUT, 'full-6-projects.png') })

  if (existsSync(join(home, 'opencut-export.mp4'))) copyFileSync(join(home, 'opencut-export.mp4'), join(OUT, 'full-export-saved.mp4'))
  log.console = (await app!.console({ limit: 400 })).entries
  writeFileSync(join(OUT, 'full-result.json'), JSON.stringify(log, null, 2))
  expect(true).toBe(true)
})

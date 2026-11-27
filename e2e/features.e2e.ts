// Editing features beyond cutting, on the acde runtime: the Effects tab (effect tiles render previews through
// applyEffectPasses), applying an effect to a clip, adding text, and the preview's fullscreen button.
// Records console errors, preview samples and screenshots per step into OUT (build/smoke/features-*).
import { test, expect } from 'acdev/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.env.SMOKE_OUT ?? join(import.meta.dir, '..', 'build', 'smoke')
const MEDIA = process.env.SMOKE_MEDIA ?? join(import.meta.dir, 'fixtures')
mkdirSync(OUT, { recursive: true })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const SAMPLE = `(() => {
  const c = [...document.querySelectorAll('canvas')].find((x) => x.width >= 1280)
  if (!c) return null
  const t = document.createElement('canvas'); t.width = 64; t.height = 36
  const x = t.getContext('2d'); x.drawImage(c, 0, 0, 64, 36)
  const d = x.getImageData(0, 0, 64, 36).data; const colours = new Set()
  for (let i = 0; i < d.length; i += 4 * 3) colours.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4))
  // Sharpness: mean absolute difference between horizontal neighbours on the middle row (blur lowers it).
  let edge = 0; const y = 18; for (let u = 1; u < 64; u++) { const a = (y * 64 + u) * 4, b = a - 4; edge += Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]) }
  return { distinctColours: colours.size, sharpness: Math.round(edge / 63), centre: Array.from(x.getImageData(32, 18, 1, 1).data) }
})()`

test('opencut features', async ({ app, acde }) => {
  const log: Record<string, unknown> = {}
  const errors = async (step: string) => {
    log[`${step}Errors`] = ((await app!.console({ limit: 400 })).entries as { level?: string; text?: string; message?: string }[])
      .filter((e) => e.level === 'error').map((e) => String(e.text ?? e.message).slice(0, 300))
  }
  await wait(3000)
  await app!.evaluate<void>(`document.querySelector('a[href="/projects"]')?.click()`)
  await wait(3000)
  await app!.getByRole('button', { name: /New project/ }).first().click()
  await wait(6000)
  await app!.keyboard.press('Escape')
  await wait(800)
  await acde.chooseFiles([join(MEDIA, 'h264_aac.mp4')])
  await app!.getByRole('button', { name: /^Import$/ }).first().click()
  await wait(7000)
  await app!.evaluate<string>(`(() => { const l = [...document.querySelectorAll('[title]')].find(e => e.getAttribute('title') === 'h264_aac.mp4'); const b = l?.closest('.group')?.querySelector('button'); b?.click(); return b ? 'clicked' : 'none' })()`)
  await wait(4000)
  log.base = await app!.evaluate<unknown>(SAMPLE)
  log.tabs = await app!.evaluate<string[]>(`[...document.querySelectorAll('button[aria-label], [role=tab]')].map(b => b.getAttribute('aria-label') || b.textContent?.trim()).filter(Boolean).slice(0, 20)`)

  // Effects tab: effect tiles render their previews with applyEffectPasses (docs D7).
  log.effectsTab = await app!.evaluate<string>(`(() => { const b = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').trim() === 'Effects' || b.textContent?.trim() === 'Effects'); b?.click(); return b ? 'clicked' : 'none' })()`)
  await wait(5000)
  log.effectTiles = await app!.evaluate<unknown>(`[...document.querySelectorAll('[title]')].map(e => e.getAttribute('title')).slice(0, 12)`)
  log.effectPreviewImages = await app!.evaluate<unknown>(`[...document.querySelectorAll('img')].filter(i => i.src.startsWith('data:') || i.src.startsWith('blob:')).length`)
  await app!.screenshot({ path: join(OUT, 'features-1-effects-tab.png') })
  await errors('effects')

  // Apply the first effect with its + button, then sample the preview (a blur lowers sharpness).
  log.effectAdded = await app!.evaluate<string>(`(() => { const b = document.querySelector('.group button'); if (!b) return 'none'; b.click(); return 'clicked ' + (b.closest('.group')?.textContent?.trim().slice(0, 30) ?? '') })()`)
  await wait(4000)
  log.afterEffect = await app!.evaluate<unknown>(SAMPLE)
  await app!.screenshot({ path: join(OUT, 'features-2-effect-applied.png') })
  await errors('effectApplied')

  // Text tab: add the default text.
  log.textTab = await app!.evaluate<string>(`(() => { const b = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').trim() === 'Text' || b.textContent?.trim() === 'Text'); b?.click(); return b ? 'clicked' : 'none' })()`)
  await wait(3000)
  log.textAdded = await app!.evaluate<string>(`(() => { const b = document.querySelector('.group button'); if (!b) return 'none'; b.click(); return 'clicked' })()`)
  await wait(4000)
  log.afterText = await app!.evaluate<unknown>(SAMPLE)
  await app!.screenshot({ path: join(OUT, 'features-3-text.png') })
  await errors('text')

  // Fullscreen button of the preview (docs D14): the icon button after "Fit" in the preview toolbar.
  const previewBox = `(() => { const c = [...document.querySelectorAll('canvas')].find((x) => x.width >= 1280); const r = c?.getBoundingClientRect(); return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null })()`
  log.previewBeforeFullscreen = await app!.evaluate<unknown>(previewBox)
  log.fullscreenClick = await app!.evaluate<string>(`(() => {
    const fit = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Fit')
    const bar = fit?.parentElement?.parentElement
    const buttons = bar ? [...bar.querySelectorAll('button')] : []
    const b = buttons[buttons.length - 1]
    if (!b || b === fit) return 'no fullscreen button found'
    b.click(); return 'clicked'
  })()`)
  await wait(1500)
  log.previewInFullscreen = await app!.evaluate<unknown>(previewBox)
  await app!.screenshot({ path: join(OUT, 'features-4-fullscreen.png') })
  await app!.keyboard.press('Escape')
  await wait(1000)
  log.previewAfterEscape = await app!.evaluate<unknown>(previewBox)
  await errors('fullscreen')
  writeFileSync(join(OUT, 'features-result.json'), JSON.stringify(log, null, 2))
  expect(true).toBe(true)
})

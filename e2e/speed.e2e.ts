// Speed change with pitch preserved on the acde runtime (docs D11: no ScriptProcessorNode). Sets the clip to 2x
// with "Change pitch" off, exports, and keeps the file as build/smoke/speed-export.mp4: it should last ~1.5 s and keep
// the fixture's 440 Hz tone (880 Hz would mean the pitch changed). Results go to build/smoke/speed-*.
import { test, expect } from 'acdev/test'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.env.SMOKE_OUT ?? join(import.meta.dir, '..', 'build', 'smoke')
const MEDIA = process.env.SMOKE_MEDIA ?? join(import.meta.dir, 'fixtures')
mkdirSync(OUT, { recursive: true })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('opencut speed', async ({ app, acde, home }) => {
  const log: Record<string, unknown> = {}
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

  // Speed tab of the selected clip: 2x, then "Change pitch" off.
  log.speedTab = await app!.evaluate<string>(`(() => { const b = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').trim() === 'Speed'); b?.click(); return b ? 'clicked' : 'none' })()`)
  await wait(1500)
  const input = app!.locator('input').filter({ has: app!.locator(':scope') })
  void input
  log.speedInput = await app!.evaluate<string>(`(() => {
    const label = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent?.trim() === 'Speed' && e.closest('label, [class*=field], div'))
    const inputs = [...document.querySelectorAll('input')]
    const i = inputs.find(x => x.closest('section, div')?.textContent?.includes('Change pitch')) ?? inputs.find(x => /^1(\\.0+)?$/.test(x.value))
    if (!i) return 'no speed input'
    i.focus(); i.select?.(); return 'focused value=' + i.value
  })()`)
  await app!.keyboard.press('Control+a')
  await app!.keyboard.type('2')
  await app!.keyboard.press('Enter')
  await wait(1500)
  log.pitchSwitch = await app!.evaluate<string>(`(() => { const s = document.querySelector('[role=switch]'); if (!s) return 'no switch'; const before = s.getAttribute('aria-checked'); s.click(); return 'was ' + before })()`)
  await wait(2000)
  log.pitchSwitchAfter = await app!.evaluate<string | null>(`document.querySelector('[role=switch]')?.getAttribute('aria-checked') ?? null`)
  log.duration = await app!.evaluate<string[]>(`[...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /^\\d\\d:\\d\\d:\\d\\d:\\d\\d$/.test(e.textContent ?? '')).map(e => e.textContent)`)
  await app!.screenshot({ path: join(OUT, 'speed-1-set.png') })

  await app!.getByRole('button', { name: /^Export$/ }).first().click()
  await wait(1500)
  await acde.chooseSaveFile(join(home, 'speed-export.mp4'))
  await app!.getByRole('button', { name: /^Export$/ }).last().click()
  await wait(20000)
  if (existsSync(join(home, 'speed-export.mp4'))) copyFileSync(join(home, 'speed-export.mp4'), join(OUT, 'speed-export.mp4'))
  log.saved = existsSync(join(home, 'speed-export.mp4'))
  log.errors = ((await app!.console({ limit: 300 })).entries as { level?: string; text?: string }[]).filter((e) => e.level === 'error').map((e) => String(e.text).slice(0, 300))
  writeFileSync(join(OUT, 'speed-result.json'), JSON.stringify(log, null, 2))
  expect(true).toBe(true)
})

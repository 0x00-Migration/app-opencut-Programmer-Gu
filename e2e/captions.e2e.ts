// Auto captions on the acde runtime (docs D13): transformers.js runs Whisper in a module Worker. Imports
// SMOKE_SPEECH (a clip with speech; local only), adds it to the timeline, presses "Generate transcript" in the
// Captions tab, and records the progress steps, errors and the captions that were inserted.
// Run: SMOKE_SPEECH=/path/to/speech.mp4 scripts/acdev.sh test --timeout 900000 e2e/captions.e2e.ts
import { test, expect } from 'acdev/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'

const OUT = process.env.SMOKE_OUT ?? join(import.meta.dir, '..', 'build', 'smoke')
const SPEECH = process.env.SMOKE_SPEECH ?? ''
mkdirSync(OUT, { recursive: true })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('opencut captions', async ({ app, acde }) => {
  if (!SPEECH) { console.log('SMOKE_SPEECH not set: skipped'); return }
  const log: Record<string, unknown> = {}
  await wait(3000)
  await app!.evaluate<void>(`document.querySelector('a[href="/projects"]')?.click()`)
  await wait(3000)
  await app!.getByRole('button', { name: /New project/ }).first().click()
  await wait(6000)
  await app!.keyboard.press('Escape')
  await wait(800)
  await acde.chooseFiles([SPEECH])
  await app!.getByRole('button', { name: /^Import$/ }).first().click()
  await wait(7000)
  const name = basename(SPEECH)
  log.added = await app!.evaluate<string>(`(() => { const l = [...document.querySelectorAll('[title]')].find(e => e.getAttribute('title') === ${JSON.stringify(name)}); const b = l?.closest('.group')?.querySelector('button'); b?.click(); return b ? 'clicked' : 'none' })()`)
  await wait(4000)

  log.captionsTab = await app!.evaluate<string>(`(() => { const b = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').trim() === 'Captions'); b?.click(); return b ? 'clicked' : 'none' })()`)
  await wait(2000)
  await app!.screenshot({ path: join(OUT, 'captions-1-tab.png') })
  // Record what happens to the transcription Worker (OpenCut does not listen for its error event).
  await app!.evaluate<void>(`(() => {
    window.__workers = []; const W = window.Worker
    window.Worker = function (url, options) {
      const entry = { url: String(url).slice(0, 160), type: options?.type, errors: [], messages: [], marks: [] }; window.__workers.push(entry)
      const w = new W(url, options)
      // "__mark" messages come from temporary markers in transformers.js (debugging only; not in the repo).
      w.addEventListener('message', (e) => { if (e.data?.type === '__mark') entry.marks = [...entry.marks, e.data.m].slice(-80) })
      w.addEventListener('error', (e) => entry.errors.push(String(e.message || e.type) + ' @' + (e.filename || '') + ':' + (e.lineno || '')))
      w.addEventListener('messageerror', () => entry.errors.push('messageerror'))
      w.addEventListener('message', (e) => { const t = e.data?.type; if (entry.messages[entry.messages.length - 1] !== t) entry.messages.push(t + (e.data?.error ? ': ' + String(e.data.error).slice(0, 300) : '')) })
      return w
    }
    window.Worker.prototype = W.prototype
  })()`)
  log.generate = await app!.evaluate<string>(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Generate transcript'); b?.click(); return b ? 'clicked' : 'none' })()`)

  // Follow the button's progress text until it returns to "Generate transcript" (done or failed), up to
  // SMOKE_CAPTIONS_SECONDS (default 600).
  const steps: string[] = []
  const rounds = Math.ceil(Number(process.env.SMOKE_CAPTIONS_SECONDS ?? 600) / 2)
  for (let i = 0; i < rounds; i++) {
    await wait(2000)
    const state = await app!.evaluate<string>(`(() => { const b = [...document.querySelectorAll('button')].find(b => /Generate transcript|Loading model|Extracting|Preparing|Transcrib|Generating/.test(b.textContent ?? '')); return b?.textContent?.trim() ?? 'no button' })()`)
    if (steps[steps.length - 1] !== state) steps.push(state)
    if (i > 2 && state === 'Generate transcript') break
  }
  log.steps = steps
  log.workers = await app!.evaluate<unknown>('window.__workers')
  log.panelText = (await app!.evaluate<string>(`[...document.querySelectorAll('[role=alert], .text-destructive')].map(e => e.textContent).join(' | ')`)).slice(0, 400)
  // Timeline labels: the lines after the "Main scene" switcher, without timecodes, the ruler and the clip name.
  log.captionTexts = await app!.evaluate<string[]>(`(() => { const lines = document.body.innerText.split('\\n').map(s => s.trim()).filter(Boolean); const i = lines.indexOf('Main scene'); return lines.slice(i + 1).filter(s => !/^\\d|^\\d+f$|\\.(mp4|mov|webm)$|^Ripple$|^Video$/.test(s)).slice(0, 30) })()`)
  await app!.screenshot({ path: join(OUT, 'captions-2-done.png') })
  const entries = (await app!.console({ limit: 500 })).entries as { level?: string; text?: string }[]
  log.errors = entries.filter((e) => e.level === 'error').map((e) => String(e.text).slice(0, 400))
  log.modelRequests = ((await app!.network({ limit: 500 })).entries as { url?: string; status?: number; method?: string }[])
    .filter((e) => /huggingface|hf\.co|jsdelivr/.test(String(e.url))).map((e) => `${e.status ?? ''} ${String(e.url).slice(0, 140)}`)
  log.failedRequests =((await app!.network({ limit: 300, failed: true })).entries as { url?: string; status?: number; error?: string }[]).map((e) => `${e.status ?? ''} ${e.error ?? ''} ${String(e.url).slice(0, 120)}`)
  writeFileSync(join(OUT, 'captions-result.json'), JSON.stringify(log, null, 2))
  // SMOKE_KEEP_EVIDENCE=1 fails the test on purpose so acdev keeps the session evidence (output.log, …).
  expect(process.env.SMOKE_KEEP_EVIDENCE ? 'keep evidence' : true).toBe(true)
})

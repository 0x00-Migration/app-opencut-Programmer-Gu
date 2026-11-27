// Chrome control for e2e/full.e2e.ts: serve this repo's production build (.next/standalone, made by `acdev build`)
// on localhost and drive the same flow in headless Google Chrome over the DevTools protocol: new project, import
// the MP4, add it to the timeline, play, go back to the project list and analyse the project thumbnail.
// Run: bun e2e/chrome-baseline.ts   → .acde/smoke/chrome-result.json and chrome-*.png
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const OUT = join(root, '.acde', 'smoke')
mkdirSync(OUT, { recursive: true })
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const wait = (ms: number) => Bun.sleep(ms)
const port = 3400 + Math.floor(Math.random() * 400)
const cdpPort = 9400 + Math.floor(Math.random() * 400)

// acdev moves .next/standalone into .acde/backend (static files copied next to server.js); in a git worktree Next
// nests server.js under the path relative to its tracing root, so search for it.
const serverJs = (await Array.fromAsync(new Bun.Glob('**/server.js').scan({ cwd: join(root, '.acde', 'backend'), dot: true })))
  .filter((p) => !p.includes('node_modules')).map((p) => join(root, '.acde', 'backend', p))[0]
if (!serverJs) throw new Error('no server.js under .acde/backend: run scripts/acdev.sh build first')
const server = Bun.spawn(['node', serverJs], {
  env: { ...process.env, PORT: String(port), HOSTNAME: '127.0.0.1', NODE_ENV: 'production' },
  stdout: 'pipe', stderr: 'pipe',
})
const proc = Bun.spawn([chrome, '--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'oc-chrome-'))}`,
  '--enable-unsafe-webgpu', '--window-size=1280,800', 'about:blank'], { stdout: 'ignore', stderr: 'ignore' })

let page: { webSocketDebuggerUrl: string } | undefined
for (let i = 0; i < 60 && !page; i++) {
  await wait(250)
  try { page = ((await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()) as any[]).find((t) => t.type === 'page') } catch {}
}
const ws = new WebSocket(page!.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map<number, (v: any) => void>()
ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.id) { pending.get(m.id)?.(m.result ?? m.error); pending.delete(m.id) } }
const send = (method: string, params: object = {}) => new Promise<any>((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })) })
const js = async (expression: string) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value
const shot = async (name: string) => writeFileSync(join(OUT, name), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
const key = async (k: string, code: string, keyCode: number) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: keyCode })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: keyCode })
}

for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break } catch {} await wait(500) }
await send('Page.enable'); await send('DOM.enable'); await send('Runtime.enable')
const log: Record<string, unknown> = { browser: (await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json()).Browser }

await send('Page.navigate', { url: `http://127.0.0.1:${port}/projects` })
await wait(5000)
await js(`[...document.querySelectorAll('button')].find(b => /New project/.test(b.textContent))?.click()`)
await wait(7000)
await key('Escape', 'Escape', 27)
await wait(800)
log.editorPath = await js('location.pathname')

const doc = await send('DOM.getDocument', { depth: -1, pierce: true })
const { nodeId } = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' })
await send('DOM.setFileInputFiles', { nodeId, files: [join(import.meta.dir, 'fixtures', 'h264_aac.mp4')] })
await wait(7000)
log.assets = await js(`[...document.querySelectorAll('[title]')].map(e => e.getAttribute('title')).filter(t => /\\.mp4$/.test(t))`)
await shot('chrome-1-imported.png')

log.added = await js(`(() => { const l = [...document.querySelectorAll('[title]')].find(e => e.getAttribute('title') === 'h264_aac.mp4'); const b = l?.closest('.group')?.querySelector('button'); if (!b) return 'no + button'; b.click(); return 'clicked' })()`)
await wait(4000)
await shot('chrome-2-on-timeline.png')

await js('history.back()')
await wait(8000)
log.projectsPath = await js('location.pathname')
log.thumbnail = await js(`(async () => {
  const img = [...document.images].find((i) => i.src.startsWith('data:image'))
  if (!img) return { found: false, images: document.images.length }
  await img.decode().catch(() => {})
  const c = document.createElement('canvas'); c.width = 32; c.height = 18
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 18)
  const d = x.getImageData(0, 0, 32, 18).data; const colours = new Set(); let alpha = 0
  for (let i = 0; i < d.length; i += 4) { colours.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); alpha += d[i + 3] }
  return { found: true, bytes: img.src.length, size: img.naturalWidth + 'x' + img.naturalHeight, distinctColours: colours.size, meanAlpha: Math.round(alpha / (d.length / 4)), topLeft: Array.from(x.getImageData(1, 1, 1, 1).data) }
})()`)
await shot('chrome-3-projects.png')

writeFileSync(join(OUT, 'chrome-result.json'), JSON.stringify(log, null, 2))
console.log(JSON.stringify(log))
ws.close(); proc.kill(); server.kill()
process.exit(0)

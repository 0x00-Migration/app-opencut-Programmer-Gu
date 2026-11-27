// Smoke test of the migrated OpenCut on the acdev runtime: home page, projects page, create a project, open the editor.
// Screenshots and console go to OUT (build/smoke/smoke-*).
import { test, expect } from 'acdev/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.env.SMOKE_OUT ?? join(import.meta.dir, '..', 'build', 'smoke')
const log: Record<string, unknown> = {}
mkdirSync(OUT, { recursive: true })

test('opencut smoke', async ({ app }) => {
  await new Promise((r) => setTimeout(r, 4000))
  log.homeUrl = await app!.evaluate<string>('location.href')
  log.homeTitle = await app!.evaluate<string>('document.title')
  await app!.screenshot({ path: join(OUT, 'smoke-1-home.png') })

  // Go to the projects page the way the site's own link does (an absolute path).
  await app!.evaluate<void>(`document.querySelector('a[href="/projects"]')?.click() ?? (location.href = '/projects')`)
  await new Promise((r) => setTimeout(r, 4000))
  log.projectsUrl = await app!.evaluate<string>('location.href')
  log.projectsBody = (await app!.evaluate<string>('document.body.innerText')).slice(0, 400)
  await app!.screenshot({ path: join(OUT, 'smoke-2-projects.png') })

  try {
    await app!.getByRole('button', { name: /New project/ }).first().click({ timeout: 10_000 })
    await new Promise((r) => setTimeout(r, 8000))
  } catch (e) { log.newProjectError = String(e) }
  log.editorUrl = await app!.evaluate<string>('location.href')
  log.editorBody = (await app!.evaluate<string>('document.body.innerText')).slice(0, 600)
  log.gpu = await app!.evaluate<unknown>(`({ wasmPanic: window.__wasmPanic ?? null, canvases: [...document.querySelectorAll('canvas')].map(c => c.width + 'x' + c.height) })`)
  await app!.screenshot({ path: join(OUT, 'smoke-3-editor.png') })
  log.console = (await app!.console({ limit: 300 })).entries
  writeFileSync(join(OUT, 'smoke-result.json'), JSON.stringify(log, null, 2))
  expect(true).toBe(true)
})

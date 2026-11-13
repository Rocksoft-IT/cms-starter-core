import { afterAll, beforeAll, expect, test } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'
import { getViteConfig } from 'astro/config'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { fileURLToPath } from 'node:url'
import { jsonForScript } from '../lib/json-script'

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url))
let server: ViteDevServer

beforeAll(async () => {
  const config = await getViteConfig(
    {
      resolve: { alias: { '~site': `${projectRoot}/src` } },
      server: { middlewareMode: true, watch: null },
      optimizeDeps: { noDiscovery: true, entries: [] },
    },
    { root: projectRoot, configFile: false },
  )({ mode: 'test', command: 'serve' })
  server = await createServer({
    ...config,
    configFile: false,
    server: { middlewareMode: true, watch: null },
    optimizeDeps: { noDiscovery: true, entries: [] },
  })
}, 90_000)

afterAll(async () => {
  await server?.close()
})

test('gallery alt and image values cannot close the JSON script or inject executable HTML', async () => {
  const payload = '</ScRiPt><script>window.galleryXss = true</script><!--'
  const images = [{ image: `/photo.png?caption=${payload}`, alt: payload }]
  const { default: Gallery } = await server.ssrLoadModule(
    `${projectRoot}/packages/cms-starter-core/core/blocks/Gallery.astro`,
  )
  const container = await AstroContainer.create()
  const html = await container.renderToString(Gallery, {
    props: { block: { type: 'gallery', data: { images } } },
  })
  const data = html.match(/<script\b[^>]*data-gallery-sources[^>]*>([\s\S]*?)<\/script>/i)?.[1]
  expect(data).toBeDefined()
  expect(data).not.toContain('<')
  expect(JSON.parse(data!)).toEqual([{ src: images[0].image, alt: payload }])
}, 30_000)

test('script-safe JSON retains Unicode, quotes, ampersands and HTML as data', () => {
  const value = { caption: 'Łódź & "tekst" <b> opis </b> \u2028\u2029' }
  expect(JSON.parse(jsonForScript(value))).toEqual(value)
  expect(jsonForScript(value)).not.toContain('<')
})

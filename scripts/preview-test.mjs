// `astro preview` for Playwright's webServer: `node preview-test.mjs <port> [outDir]`.
//
// The programmatic API rather than the CLI: the CLI keeps one lockfile per project root, so the
// default and the zone-off builds could not be served at once, and it backgrounds itself when it
// detects an agent (cli/preview → isRunByAgent), which Playwright reports as "Process from
// config.webServer exited early". Re-check both on an Astro bump.
import { preview } from 'astro'

const port = Number(process.argv[2])
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Pass a preview port between 1 and 65535.')
}

const server = await preview({
  outDir: process.argv[3] ?? 'dist',
  server: { port, host: '127.0.0.1' },
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await server.stop()
    process.exit(0)
  })
}

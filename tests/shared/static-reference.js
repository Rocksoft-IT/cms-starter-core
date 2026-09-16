// Serving the REFERENCE side of a port, when the reference is a folder rather than a website.
//
// Both harnesses take `OLD_BASE_URL` and both used to mean one thing by it: an origin that is
// already on the internet. That is right for the case they were built for — a live site being
// replaced — and wrong for the case that is actually the norm here: **the design arrives as a
// static HTML/CSS/JS repo**, and there is no deployed reference at all until someone puts one
// somewhere. Every port therefore began by NOT using the tools that can fail a run:
//
//   - `test:vrt` and `test:measure` were unusable on day one, so the first pass was done by eye
//     and the numbers were recovered by reading stylesheets by hand;
//   - and when a URL was eventually supplied it was whichever address the client's domain
//     answered on — which, for kwalitet, was the site the redesign REPLACES, not the redesign.
//     The committed baseline recorded the wrong design and reported agreement for weeks
//     (kwalitet-pl#2).
//
// So `OLD_BASE_URL` now also accepts a PATH. Point it at the design repo and the harness serves
// that folder itself, on a loopback port it owns for the length of the run:
//
//   OLD_BASE_URL=../kwalitet-Website pnpm test:vrt
//   OLD_BASE_URL=../kwalitet-Website MEASURE_SAVE=1 pnpm test:measure
//
// The reference is then the artefact the designer actually handed over, the run is offline and
// deterministic (so it can go in CI), and there is no deploy step in front of the first
// measurement.
//
// Two details make a plain static server insufficient, and both were paid for before this existed:
//
//   1. **Extensionless addresses.** A design repo holds `uslugi.html`; the build it is being
//      ported into serves `/uslugi/`. A `python -m http.server` 404s on `/uslugi`, which the
//      harnesses report as a broken run — so every target grew an `old_path` pointing at a
//      deployed site instead, which is how the wrong-site baseline got in. The resolver below
//      tries `<path>`, then `<path>.html`, then `<path>/index.html`, so the SAME address works on
//      both sides and `old_path` is needed only for a genuine rename.
//   2. **`file://` is not an option.** Chromium gives every local stylesheet its own opaque
//      origin there: `sheet.cssRules` throws and the page renders with no CSS. The first run of
//      `parity:source` reported a card as 1424x70 with zero rules — indistinguishable from a
//      section that has no styling. Serving the directory removes the whole class of problem, and
//      that is why this module, not a `file://` URL, is the shared answer.
//
// One caveat worth stating because it is invisible: a design repo usually loads its webfonts from
// a CDN. Served locally with no network — in CI, or a sandbox — those requests fail and the text
// boxes are measured in a fallback face, which moves every width. Fonts have to resolve (network,
// or the faces installed locally) for TEXT metrics to mean anything; box geometry is unaffected.
import { createReadStream, existsSync, statSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'

// Everything a static design export is made of. An unknown extension is served as
// `application/octet-stream` rather than refused: the browser ignores what it cannot use, and a
// missing entry must never be the reason a reference fails to render.
const MIME = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
}

/**
 * Is this `OLD_BASE_URL` an origin, or a folder on disk?
 *
 * Deliberately narrow: anything carrying a scheme is a URL and is passed through untouched, so a
 * value that used to work still does. Everything else — `../design`, `/abs/path`, `./x` — is a
 * path. A bare hostname (`example.com`) is neither, and is treated as a path so it fails with
 * "not a directory" naming the thing the caller typed, rather than being silently fetched from a
 * relative URL that resolves against nothing.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isDirectoryReference(value) {
  return !/^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim())
}

/**
 * Resolve one request path to a file inside `root`, or `null`.
 *
 * The three candidates are the whole reason this is not `serve-static`: a design repo's page is
 * `uslugi.html` and the address being compared is `/uslugi/`.
 *
 * @param {string} root  absolute directory
 * @param {string} urlPath  decoded pathname, always starting with `/`
 * @returns {string | null} an absolute file path inside `root`
 */
export function resolveReferenceFile(root, urlPath) {
  // A trailing slash is a directory in a URL and nothing at all on disk. Dropped first so the
  // three candidates below do not each have to cope with both spellings.
  const rel = urlPath.replace(/\/+$/, '')
  const base = path.join(root, rel)

  // Containment is checked on the JOINED path, before any candidate is tested: `..` segments are
  // resolved by `path.join`, so `/../../etc/passwd` becomes a path outside `root` here and is
  // rejected once, rather than three times with three chances to get it wrong.
  const resolved = path.resolve(base)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null

  for (const candidate of [resolved, `${resolved}.html`, path.join(resolved, 'index.html')]) {
    // `isFile()`, not `existsSync()`: the bare path is a DIRECTORY for `/uslugi` in a repo that
    // has both `uslugi.html` and an `uslugi/` folder of sub-pages — which is the ordinary shape —
    // and streaming a directory throws EISDIR instead of falling through to the .html beside it.
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/**
 * Serve a static design repo on loopback for the length of a run.
 *
 * @param {string} dir  the design repo, relative to the cwd or absolute
 * @param {string} tool  prefix for error messages, e.g. `measure`
 * @returns {Promise<{ origin: string, close: () => Promise<void> }>}
 */
export async function startStaticReference(dir, tool) {
  // Relative to the cwd, so `OLD_BASE_URL=../kwalitet-Website` reads the way it looks from a shell
  // — the same rule `siteRoot()` follows for `MEASURE_REPO`.
  const root = path.resolve(process.cwd(), dir.trim())

  // Named before anything is served. A typo'd path would otherwise surface as every route 404ing,
  // which reads as a reference whose pages have moved rather than as a path that is not there.
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(
      `[${tool}] OLD_BASE_URL=${dir} is neither a URL nor a directory (resolved to ${root}).\n` +
        'Point it at a deployed reference (https://…) or at the static design repo to serve.',
    )
  }

  const server = http.createServer((req, res) => {
    let pathname
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://reference.invalid').pathname)
    } catch {
      // A malformed percent-escape throws out of decodeURIComponent. 400, not a crash: one bad
      // asset URL in a design export must not take the whole run down.
      return res.writeHead(400).end()
    }

    const file = resolveReferenceFile(root, pathname)
    if (!file) return res.writeHead(404).end()

    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })

  // Port 0 — the OS picks a free one. A fixed port is how two runs in two worktrees end up
  // measuring each other's reference, which is the `reuseExistingServer` trap one tree over.
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

/**
 * Turn an `OLD_BASE_URL` into an origin to fetch from, whichever kind it is.
 *
 * A URL passes through with a no-op `close`, so a caller has one shape to handle and cannot
 * forget to shut down a server it did not know it started.
 *
 * @param {string} value  the raw `OLD_BASE_URL`
 * @param {string} tool  prefix for error messages
 * @returns {Promise<{ origin: string, close: () => Promise<void>, served: boolean }>}
 */
export async function resolveReferenceOrigin(value, tool) {
  if (!isDirectoryReference(value)) {
    // Trailing slash stripped so callers can concatenate a path onto it without doubling it — the
    // served branch returns an origin with no trailing slash either.
    return { origin: value.trim().replace(/\/+$/, ''), close: async () => {}, served: false }
  }
  const { origin, close } = await startStaticReference(value, tool)
  return { origin, close, served: true }
}

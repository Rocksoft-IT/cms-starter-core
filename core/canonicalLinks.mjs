// Rewrites internal links in the built HTML to the page's own address, so a click never costs a
// redirect (dashboard #2477). They come from editor-written HTML (rich text, `custom_html`), which
// lib/html-hrefs.ts renders verbatim on the default tree: `/about`, `https://<apex>/`,
// `/index.html`. An href changes only when the page it would point to exists in the build.
//
// Plain .mjs with a .d.mts sibling, for the reason redirects.mjs is.

import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ANCHOR_START_TAG = /<a\b[^>]*>/gi
const HREF_ATTRIBUTE = /(\shref\s*=\s*)(["'])(.*?)\2/i

/** `example.com` and `www.example.com`, whichever of the two `site` names. */
export function siteHosts(site) {
  const host = site && URL.canParse(String(site)) ? new URL(String(site)).hostname.replace(/^www\./, '') : ''

  return new Set(host ? [host, `www.${host}`] : [])
}

/** The page's own address for `value`, or null to leave the href as written. */
export function canonicalHref(value, hosts, isPage) {
  let target = value.trim()

  if (/^https?:\/\//i.test(target)) {
    if (!URL.canParse(target)) return null
    const url = new URL(target)
    if (!hosts.has(url.hostname)) return null
    target = `${url.pathname}${url.search}${url.hash}`
  }

  if (!target.startsWith('/') || target.startsWith('//')) return null

  const cut = target.search(/[?#]/)
  const rest = cut === -1 ? '' : target.slice(cut)
  let route = (cut === -1 ? target : target.slice(0, cut)).replace(/(^|\/)index\.html$/i, '$1')

  if (/\.[a-z0-9]{2,5}$/i.test(route)) return null // a file, not a page
  if (!route.endsWith('/')) route += '/'
  if (!isPage(route)) return null

  const next = `${route}${rest}`

  return next === value ? null : next
}

/** `html` with every internal `<a href>` rewritten by canonicalHref(), and how many changed. */
export function canonicalizeHtmlLinks(html, hosts, isPage) {
  let changed = 0

  const out = html.replace(ANCHOR_START_TAG, (tag) =>
    tag.replace(HREF_ATTRIBUTE, (whole, lead, quote, value) => {
      const next = canonicalHref(value, hosts, isPage)
      if (next === null) return whole
      changed++

      return `${lead}${quote}${next}${quote}`
    }),
  )

  return { html: out, changed }
}

/** Rewrite every HTML file under `dist`; the number of links changed. */
export async function writeCanonicalLinks(dist, site, logger) {
  const files = (await readdir(dist, { recursive: true }))
    .filter((file) => file.endsWith('.html'))
    .map((file) => path.join(dist, file))

  // dist/om-oss/index.html → /om-oss/, dist/index.html → /
  const pages = new Set(
    files
      .filter((file) => path.basename(file) === 'index.html')
      .map((file) => `/${path.relative(dist, path.dirname(file)).split(path.sep).join('/')}/`.replace('//', '/')),
  )
  const hosts = siteHosts(site)

  let total = 0
  for (const file of files) {
    const { html, changed } = canonicalizeHtmlLinks(await readFile(file, 'utf8'), hosts, (route) => pages.has(route))
    if (changed === 0) continue
    await writeFile(file, html, 'utf8')
    total += changed
  }

  if (total > 0) logger?.info(`${total} internal link(s) pointed straight at their page.`)

  return total
}

/**
 * What a video URL an editor pasted actually IS: which host it belongs to, its id there, the
 * address a card should link to, and — the point of the whole file — the poster image that can be
 * derived from the URL alone.
 *
 * That derivation is why the `videos` block asks for a link and a label and nothing else
 * (dashboard#1914). The alternative the block replaces was `cards` with `layout: bento`, where the
 * editor pasted the thumbnail URL by hand: a second value to keep in step with the first, silently
 * wrong from the moment a clip is replaced. Deriving it means there is only ever one value.
 *
 * PURE, and deliberately so: no fetch, no oEmbed, no network. A build that reaches out to a video
 * host is a build that can fail — or hang — without the content having changed, and `build:mock`
 * and CI run with no network at all. So a host whose poster is NOT derivable from its URL (Vimeo:
 * its thumbnail lives behind `vimeo.com/api/oembed.json`, keyed by an id that is not part of the
 * file name) yields `thumbnail: null` and the block falls back to the editor's own `image`.
 * Recognising Vimeo is still worth doing — the id and a normalized link are useful, and a caller
 * can tell "not a video host" from "a host with no derivable poster".
 */

export type VideoProvider = 'youtube' | 'vimeo'

export interface ParsedVideo {
  /** The host this URL belongs to, or null for a self-hosted file or an unrecognised host. */
  provider: VideoProvider | null
  /** The id on that host, or null when there is no provider to have one on. */
  id: string | null
  /** The address to link to. Absolute URLs are passed through untouched. */
  href: string
  /** A poster derivable from the URL alone, or null when the host does not offer one. */
  thumbnail: string | null
}

/**
 * A YouTube id as it appears in a URL. Bounded rather than open-ended (`[\w-]+` would happily
 * swallow a whole path segment of a URL that merely resembles one): ids are 11 characters today
 * and have been for the life of the service, so the range allows for drift without matching prose.
 */
const YOUTUBE_ID = /^[\w-]{8,16}$/

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
])

const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'])

/** The path shapes a YouTube id can arrive in, after the `youtu.be/<id>` short form. */
const YOUTUBE_PATHS = ['/embed/', '/shorts/', '/live/', '/v/']

/**
 * Parse one CMS `url` value.
 *
 * Returns null for a value there is nothing to render from (absent, blank), so a caller can drop
 * the row rather than emit a card that links nowhere. Anything else comes back — an unrecognised
 * host and a self-hosted `/videos/clip.mp4` are both legitimate: they simply have no derivable
 * poster, which is what the `image` field is for.
 */
export function parseVideo(url: string | null | undefined): ParsedVideo | null {
  if (typeof url !== 'string') return null
  const value = url.trim()
  if (!value) return null

  const plain: ParsedVideo = { provider: null, id: null, href: value, thumbnail: null }

  // A relative path (`/videos/clip.mp4`) is a valid value and not a URL — `new URL` throws on it,
  // so the base makes parsing total and the host check below rejects the placeholder anyway.
  let parsed: URL
  try {
    parsed = new URL(value, 'https://relative.invalid')
  } catch {
    return plain
  }

  const host = parsed.hostname.toLowerCase()

  if (YOUTUBE_HOSTS.has(host)) {
    const id = youtubeId(parsed)
    if (!id) return plain

    return {
      provider: 'youtube',
      id,
      // Normalized to the watch page: an `/embed/` URL opened in a tab is a bare player without
      // the title, the channel or the description, and a card links to a page a person reads.
      href: `https://www.youtube.com/watch?v=${id}`,
      // `i.ytimg.com` rather than `img.youtube.com` — same image, and it is the host YouTube's own
      // embeds use. `hqdefault` exists for every video; `maxresdefault` does not, and a missing one
      // 404s into a broken tile.
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    }
  }

  if (VIMEO_HOSTS.has(host)) {
    const id = vimeoId(parsed)
    if (!id) return plain

    // The ORIGINAL URL, not one rebuilt from the id: an unlisted Vimeo video is only reachable
    // with the `h=` hash it was shared with, and rebuilding `vimeo.com/<id>` would drop it and
    // turn a working link into a 404 that only shows up on the live site.
    return { provider: 'vimeo', id, href: value, thumbnail: null }
  }

  return plain
}

function youtubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase()

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    return validId(url.pathname.slice(1).split('/')[0])
  }

  const watch = url.searchParams.get('v')
  if (watch) return validId(watch)

  const path = YOUTUBE_PATHS.find((prefix) => url.pathname.startsWith(prefix))
  if (!path) return null

  return validId(url.pathname.slice(path.length).split('/')[0])
}

function validId(candidate: string | undefined): string | null {
  return candidate && YOUTUBE_ID.test(candidate) ? candidate : null
}

function vimeoId(url: URL): string | null {
  // `vimeo.com/76979871`, `vimeo.com/76979871/abc123` (unlisted) and the embed form
  // `player.vimeo.com/video/76979871` — in every one of them the id is the first all-digit segment.
  const segment = url.pathname.split('/').find((part) => /^\d+$/.test(part))

  return segment ?? null
}

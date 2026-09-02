import { describe, it, expect } from 'vitest'
import { parseVideo } from '../lib/video'

// The `videos` block asks for a link and a label and derives the poster from the link
// (dashboard#1914), so this parse IS the feature: get the id wrong and the card shows a broken
// thumbnail, which nothing else in the build would notice. The cases below are the URL shapes an
// editor actually pastes — what the share sheet, the address bar and the embed dialog each hand out.
describe('parseVideo()', () => {
  it('derives a poster from every shape a YouTube link arrives in', () => {
    const expected = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'

    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?t=42',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
    ]) {
      expect(parseVideo(url), url).toMatchObject({ provider: 'youtube', id: 'dQw4w9WgXcQ', thumbnail: expected })
    }
  })

  it('links a YouTube card to the watch page, whatever was pasted', () => {
    // An `/embed/` URL opened in a tab is a bare player with no title, channel or description.
    expect(parseVideo('https://www.youtube.com/embed/dQw4w9WgXcQ')?.href).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    )
  })

  it('recognises Vimeo but offers no poster, because its URL does not carry one', () => {
    // Not an oversight: the thumbnail lives behind vimeo.com/api/oembed.json, and a build that
    // reaches the network is a build that can fail without the content changing. The block falls
    // back to the editor's own `image` here.
    expect(parseVideo('https://vimeo.com/76979871')).toMatchObject({
      provider: 'vimeo',
      id: '76979871',
      thumbnail: null,
    })
    expect(parseVideo('https://player.vimeo.com/video/76979871')).toMatchObject({ provider: 'vimeo', id: '76979871' })
  })

  it('keeps an unlisted Vimeo link exactly as pasted', () => {
    // The `h=` hash is the only thing that makes an unlisted video reachable. Rebuilding the URL
    // from the id would drop it and turn a working link into a 404 nobody sees until it is live.
    const unlisted = 'https://vimeo.com/76979871/abc123def?h=abc123def'
    expect(parseVideo(unlisted)).toMatchObject({ provider: 'vimeo', id: '76979871', href: unlisted })
  })

  it('passes through a self-hosted file and an unknown host, with no provider and no poster', () => {
    // Both are legitimate values for an `asset_url` field — they simply have no derivable poster,
    // which is what the block's `image` field is for.
    expect(parseVideo('/videos/clip.mp4')).toEqual({
      provider: null,
      id: null,
      href: '/videos/clip.mp4',
      thumbnail: null,
    })
    expect(parseVideo('https://videos.example.com/clip')).toMatchObject({ provider: null, thumbnail: null })
  })

  it('does not mistake a YouTube URL with no id for one that has it', () => {
    // A channel page, the home page, a search — none of them name a video, and inventing an id
    // from the first path segment would render a poster for a video that does not exist.
    expect(parseVideo('https://www.youtube.com/@somechannel')).toMatchObject({ provider: null, thumbnail: null })
    expect(parseVideo('https://www.youtube.com/')).toMatchObject({ provider: null, thumbnail: null })
  })

  it('answers null for a value there is nothing to render from', () => {
    // The block drops the row rather than emitting a card that links nowhere.
    expect(parseVideo(null)).toBeNull()
    expect(parseVideo(undefined)).toBeNull()
    expect(parseVideo('   ')).toBeNull()
  })
})

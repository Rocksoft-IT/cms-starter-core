/**
 * Named SVG glyphs shared by the blocks that let an editor pick an icon from a fixed set.
 *
 * Each value is the `d` of a single `<path>`, drawn on a 24×24 box with `currentColor` and no
 * fill, so a block wraps it in its own `<svg>` and the glyph inherits the surrounding colour and
 * size. Inline rather than an icon font or `<img>`: no extra request, and no way for a client to
 * paste a mismatched PNG into a 40px chip.
 *
 * Here rather than in each block because the maps had started to diverge — `info` existed twice,
 * in two files, differing by a stray space. A block picks the subset it offers by listing those
 * keys in its `config/cms.php` select; nothing forces every block to expose all of them.
 */
export const ICON_PATHS: Record<string, string> = {
  // ── Places & contact ──
  location: 'M12 21s7-5.686 7-11a7 7 0 1 0-14 0c0 5.314 7 11 7 11z M12 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  phone:
    'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M22 6l-10 7L2 6',
  calendar: 'M8 2v4M16 2v4M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',

  // ── Documents ──
  document:
    'M9 13h6m-6 4h6m2 4H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z',
  folder: 'M3 7a2 2 0 0 1 2-2h3.586a1 1 0 0 1 .707.293L11 7h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
  download: 'M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 10l5 5 5-5M12 15V3',
  external: 'M15 3h6v6 M10 14 21 3 M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',

  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 8h.01M11 12h1v4h1',
}

/** The glyph for a CMS-authored key, or undefined for an empty or unknown one. */
export function iconPath(key: unknown): string | undefined {
  return typeof key === 'string' ? ICON_PATHS[key] : undefined
}

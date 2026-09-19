// "Say it once per build" — the latch behind every warning core prints per key rather than per
// page. A build renders hundreds of pages through the same module instance, so a drop report
// printed where it is detected would repeat once per page; the latch keeps the first and drops
// the rest. Shared by customCode.ts and unregisteredBlocks.ts, which used to carry a copy each.

export interface OnceLatch {
  /** `true` the first time `key` is seen in this process, `false` on every later call. */
  first(key: string): boolean
  /** Test seam: module-level state outlives a vitest file otherwise. */
  reset(): void
}

export function onceLatch(): OnceLatch {
  const seen = new Set<string>()

  return {
    first(key) {
      if (seen.has(key)) return false
      seen.add(key)

      return true
    },
    reset() {
      seen.clear()
    },
  }
}

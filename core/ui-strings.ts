// The words CORE ITSELF says — the ones no CMS field supplies and no editor ever sees.
//
// Almost everything a core block renders is CMS content, which is translatable and therefore
// already correct in every locale. A handful of strings are not: the lightbox's close button, the
// carousel's arrows, the name a screen reader announces for a zoom control. They have no field to
// come from, they are announced rather than displayed, and until this seam existed they were
// English literals — so a Polish site announced `Close`, `Next photo`, `Previous testimonial` to
// exactly the users who cannot see that anything is wrong. (Testimonials.astro said so in a comment:
// "core has no i18n string seam yet, so they stay literal". This is that seam.)
//
// THE FALLBACK IS DELIBERATE, and it is the opposite of what a client repo should do with its own
// chrome. A client owns its dictionary, so a missing locale there must fail the build. Core does
// not: it is shared by every site, it cannot know which locales a client will enable, and refusing
// to render because nobody translated core's internals into Estonian would be a shared package
// taking a client's build down over a word it never promised. So an unknown locale falls back to
// the base language and the control still HAS an accessible name — mislabelled beats unnamed.
//
// A site that needs a locale core does not ship supplies it through `cmsConfig.coreStrings`, which
// is the same seam every other per-site value uses. That is also the escape hatch for a client that
// simply disagrees with a wording.
import { cmsConfig } from '~site/cms.config'

/** Every string core says on its own behalf. Keys are shared by all locales. */
export interface CoreStrings {
  /** The zoom button on a gallery tile that HAS alt text — names which photo it opens. */
  galleryZoomNamed: string
  /** The same button with no alt text to name it. */
  galleryZoom: string
  /** The lightbox's accessible name when the gallery block carries no heading of its own. */
  galleryDialog: string
  /** Closes the lightbox. */
  close: string
  previousPhoto: string
  nextPhoto: string
  previousTestimonial: string
  nextTestimonial: string
  /**
   * The accessible name of the video block's embed when the block carries no heading to use.
   * An iframe with no name is announced as an unlabelled frame (WCAG 2.1 4.1.2) — and announced
   * IN ENGLISH is the failure this seam exists to stop, so it is a key rather than a literal.
   */
  videoFrame: string
  /** The carousel's arrows, and the dot that jumps to one slide. */
  previousSlide: string
  nextSlide: string
  goToSlide: string
  /** Announced on each slide, so a screen reader knows where it is in the set. */
  slidePosition: string
}

/**
 * The language every other one falls back to, and the only one guaranteed complete.
 *
 * English rather than the busiest client's language: core is generic, and a developer reading an
 * untranslated control in a shared package should see the package's own language, not a guess at
 * whose site it ended up on.
 */
export const BASE_LOCALE = 'en'

const BUILT_IN: Record<string, CoreStrings> = {
  en: {
    galleryZoomNamed: 'Enlarge: {name}',
    galleryZoom: 'Enlarge photo',
    galleryDialog: 'Photo',
    close: 'Close',
    previousPhoto: 'Previous photo',
    nextPhoto: 'Next photo',
    previousTestimonial: 'Previous testimonial',
    nextTestimonial: 'Next testimonial',
    videoFrame: 'Embedded video',
    previousSlide: 'Previous slide',
    nextSlide: 'Next slide',
    goToSlide: 'Go to slide {n}',
    slidePosition: 'Slide {n} of {total}',
  },
  pl: {
    galleryZoomNamed: 'Powiększ: {name}',
    galleryZoom: 'Powiększ zdjęcie',
    galleryDialog: 'Zdjęcie',
    close: 'Zamknij',
    previousPhoto: 'Poprzednie zdjęcie',
    nextPhoto: 'Następne zdjęcie',
    previousTestimonial: 'Poprzednia opinia',
    nextTestimonial: 'Następna opinia',
    videoFrame: 'Osadzone wideo',
    previousSlide: 'Poprzedni slajd',
    nextSlide: 'Następny slajd',
    goToSlide: 'Przejdź do slajdu {n}',
    slidePosition: 'Slajd {n} z {total}',
  },
}

/** The locales core ships out of the box. A site adds its own via `cmsConfig.coreStrings`. */
export const BUILT_IN_LOCALES: string[] = Object.keys(BUILT_IN)

/**
 * One string core says, in the locale the page is being built for.
 *
 * Resolution order, first hit wins: the site's own override for this locale → core's table for this
 * locale → core's table for `BASE_LOCALE`. The last step cannot miss, so this always returns
 * something a screen reader can read out.
 *
 * An absent `locale` means the CALLER never received one — a block rendered outside
 * core/BlockRenderer.astro. That resolves to the site's default locale, not to `BASE_LOCALE`:
 * "nobody told me" and "this site is English" are different facts, and only the second one should
 * produce English on a Polish site. Handled here so no block has to remember it.
 *
 * `vars` fills `{name}`-style placeholders; an unfilled one is left as written rather than blanked,
 * so a wrong call site is visible in review instead of reading as a missing word.
 */
export function coreString(locale: string | undefined, key: keyof CoreStrings, vars?: Record<string, string>): string {
  const loc = locale ?? cmsConfig.defaultLocale
  const override = cmsConfig.coreStrings?.[loc]?.[key]
  const value = override ?? BUILT_IN[loc]?.[key] ?? BUILT_IN[BASE_LOCALE][key]
  if (!vars) return value
  return value.replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole)
}

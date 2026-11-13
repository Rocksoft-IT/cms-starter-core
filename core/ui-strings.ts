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
  /**
   * The accessible name of a card in the `videos` block that carries no label of its own. The
   * label is the card's visible name where there is one, so this is the fallback rather than a
   * duplicate announcement.
   */
  videoCard: string
  /**
   * The `video_section` banner's play button, close button and no-JavaScript link, when the block's
   * own `play_label` / `close_label` fields are empty. Announced rather than displayed (the play
   * label is the button's accessible name; the editor's own words always win).
   */
  videoPlay: string
  videoClose: string
  videoWatch: string
  /** The carousel's arrows, and the dot that jumps to one slide. */
  previousSlide: string
  nextSlide: string
  goToSlide: string
  /** Announced on each slide, so a screen reader knows where it is in the set. */
  slidePosition: string
  /**
   * The comparison table's cell states. Drawn as a mark (✓ ✕ ◐) that a screen reader cannot read
   * as the word it stands for, so the word is announced instead — in the page's language.
   */
  cellYes: string
  cellNo: string
  cellPartial: string
  /** The `cards` block's `bento` layout CTA button, when an item sets no `cta_label` of its own. */
  cardCta: string
  /**
   * The `protected_zone` block's chrome. The messages are said at RUNTIME, so the renderer writes
   * them into `data-msg-*` attributes and core/protected-zone/client.ts fills `{minutes}`/`{name}`.
   */
  protectedZoneLogin: string
  protectedZonePassword: string
  protectedZoneSubmit: string
  protectedZoneLogout: string
  protectedZoneLogoutFailed: string
  protectedZoneInvalidCredentials: string
  protectedZoneAccountBlocked: string
  protectedZoneTooManyAttempts: string
  protectedZoneNetwork: string
  protectedZoneSessionExpired: string
  protectedZoneSignedInAs: string
  /** The list heading when the block's `documents_heading` is empty. */
  protectedZoneDocuments: string
  /** The empty-list line when the block's `empty_message` is empty. */
  protectedZoneEmpty: string
  protectedZoneView: string
  protectedZoneDownload: string
  protectedZoneLoading: string
  protectedZoneUnavailable: string
  protectedZoneNoScript: string
  /** The self-service password reset: the link under the form, its two forms and their messages. */
  protectedZoneForgot: string
  protectedZoneForgotHint: string
  protectedZoneForgotSubmit: string
  protectedZoneBack: string
  protectedZoneResetSent: string
  protectedZoneResetHint: string
  protectedZoneNewPassword: string
  protectedZoneRepeatPassword: string
  protectedZoneResetSubmit: string
  protectedZoneResetDone: string
  protectedZoneResetInvalidLink: string
  protectedZoneResetPasswordInvalid: string
  protectedZoneResetMismatch: string
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
    videoCard: 'Watch video',
    videoPlay: 'Play video',
    videoClose: 'Close video',
    videoWatch: 'Watch the video',
    previousSlide: 'Previous slide',
    nextSlide: 'Next slide',
    goToSlide: 'Go to slide {n}',
    slidePosition: 'Slide {n} of {total}',
    cellYes: 'Yes',
    cellNo: 'No',
    cellPartial: 'Partly',
    cardCta: 'Learn more',
    protectedZoneLogin: 'Login',
    protectedZonePassword: 'Password',
    protectedZoneSubmit: 'Sign in',
    protectedZoneLogout: 'Sign out',
    protectedZoneLogoutFailed:
      'Sign-out could not be confirmed. Check your connection and click Sign out to try again.',
    protectedZoneInvalidCredentials: 'Incorrect login or password.',
    protectedZoneAccountBlocked: 'This account is blocked. Please contact the administrator.',
    protectedZoneTooManyAttempts: 'Too many sign-in attempts. Try again in {minutes} min.',
    protectedZoneNetwork: 'Could not connect. Check your connection and try again.',
    protectedZoneSessionExpired: 'Your session has expired. Please sign in again.',
    protectedZoneSignedInAs: 'Signed in as {name}',
    protectedZoneDocuments: 'Documents',
    protectedZoneEmpty: 'No documents.',
    protectedZoneView: 'Preview',
    protectedZoneDownload: 'Download',
    protectedZoneLoading: 'Loading…',
    protectedZoneUnavailable: 'The protected zone is unavailable.',
    protectedZoneNoScript: 'JavaScript is required to use the protected zone.',
    protectedZoneForgot: 'Forgot your password?',
    protectedZoneForgotHint:
      'Enter your login. If the account has an e-mail address, we will send a link to set a new password there.',
    protectedZoneForgotSubmit: 'Send the link',
    protectedZoneBack: 'Back to sign-in',
    protectedZoneResetSent:
      'If this account has an e-mail address, a link to set a new password is on its way. No message? Contact the administrator.',
    protectedZoneResetHint: 'Set a new password — at least 8 characters.',
    protectedZoneNewPassword: 'New password',
    protectedZoneRepeatPassword: 'Repeat the new password',
    protectedZoneResetSubmit: 'Set the password',
    protectedZoneResetDone: 'Your password has been changed. Sign in with the new one.',
    protectedZoneResetInvalidLink: 'This link has expired or was already used. Ask for a new one.',
    protectedZoneResetPasswordInvalid: 'The password must be 8 to 72 characters long.',
    protectedZoneResetMismatch: 'The passwords do not match.',
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
    videoCard: 'Obejrzyj wideo',
    videoPlay: 'Odtwórz wideo',
    videoClose: 'Zamknij wideo',
    videoWatch: 'Obejrzyj wideo',
    previousSlide: 'Poprzedni slajd',
    nextSlide: 'Następny slajd',
    goToSlide: 'Przejdź do slajdu {n}',
    slidePosition: 'Slajd {n} z {total}',
    cellYes: 'Tak',
    cellNo: 'Nie',
    cellPartial: 'Częściowo',
    cardCta: 'Dowiedz się więcej',
    // `Login` is the Polish word too, and the one Polish sign-in forms use for this field.
    protectedZoneLogin: 'Login',
    protectedZonePassword: 'Hasło',
    protectedZoneSubmit: 'Zaloguj się',
    protectedZoneLogout: 'Wyloguj się',
    protectedZoneLogoutFailed:
      'Nie udało się potwierdzić wylogowania. Sprawdź połączenie i kliknij „Wyloguj się”, aby ponowić.',
    protectedZoneInvalidCredentials: 'Nieprawidłowy login lub hasło.',
    protectedZoneAccountBlocked: 'Konto jest zablokowane. Skontaktuj się z administratorem.',
    protectedZoneTooManyAttempts: 'Zbyt wiele prób logowania. Spróbuj ponownie za {minutes} min.',
    protectedZoneNetwork: 'Nie udało się połączyć. Sprawdź połączenie i spróbuj ponownie.',
    protectedZoneSessionExpired: 'Sesja wygasła. Zaloguj się ponownie.',
    protectedZoneSignedInAs: 'Zalogowano jako {name}',
    protectedZoneDocuments: 'Dokumenty',
    protectedZoneEmpty: 'Brak dokumentów.',
    protectedZoneView: 'Podgląd',
    protectedZoneDownload: 'Pobierz',
    protectedZoneLoading: 'Wczytywanie…',
    protectedZoneUnavailable: 'Strefa chroniona jest niedostępna.',
    protectedZoneNoScript: 'Do korzystania ze strefy wymagana jest obsługa JavaScript.',
    protectedZoneForgot: 'Nie pamiętasz hasła?',
    protectedZoneForgotHint:
      'Podaj swój login. Jeśli konto ma adres e-mail, wyślemy na niego link do ustawienia nowego hasła.',
    protectedZoneForgotSubmit: 'Wyślij link',
    protectedZoneBack: 'Wróć do logowania',
    protectedZoneResetSent:
      'Jeśli to konto ma adres e-mail, wysłaliśmy na niego link do ustawienia nowego hasła. Brak wiadomości? Skontaktuj się z administratorem.',
    protectedZoneResetHint: 'Ustaw nowe hasło — co najmniej 8 znaków.',
    protectedZoneNewPassword: 'Nowe hasło',
    protectedZoneRepeatPassword: 'Powtórz nowe hasło',
    protectedZoneResetSubmit: 'Ustaw hasło',
    protectedZoneResetDone: 'Hasło zostało zmienione. Zaloguj się nowym hasłem.',
    protectedZoneResetInvalidLink: 'Ten link wygasł lub został już użyty. Poproś o nowy.',
    protectedZoneResetPasswordInvalid: 'Hasło musi mieć od 8 do 72 znaków.',
    protectedZoneResetMismatch: 'Hasła nie są takie same.',
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

// Which URL the cookie banner's "more info" link points at.
//
// Two sources can answer, and the interesting part is that they must be tried in a fixed order.
// The CMS answer — `settings.cookie_consent.privacy_page_id`, resolved against the page list — is
// authoritative whenever it exists, because it is the one a client-admin can change from the panel.
// The project-layer answer is a path hardcoded in one repo's Layout, which no client-admin can see
// or edit; letting it win would mean picking a privacy page in the panel and watching nothing
// happen on the site.
//
// The project answer exists because some sites keep their privacy notice as a hand-written route
// (`src/pages/datenschutz.astro`) rather than a CMS page. No `privacy_page_id` can name such a
// page — there is no CMS row to point at — so before this the only outcomes were a banner with no
// link at all, or a phantom CMS page created solely to be pointed at. Both are worse than letting
// the repo that owns the route say where it is.

/**
 * Pick the banner's privacy URL from the CMS-resolved path and the project-layer fallback.
 *
 * @param fromCms  Path the client's configured privacy page resolved to for this locale, or null
 *                 when no page is configured or the configured id matched nothing.
 * @param fromProject  Path or absolute URL supplied by the site's own Layout, when it keeps its
 *                 privacy notice outside the CMS.
 * @returns The URL to link to, or null to render the banner with no link.
 */
export function resolvePrivacyHref(
  fromCms: string | null | undefined,
  fromProject: string | null | undefined,
): string | null {
  // Blank is not an answer from either side. A whitespace-only CMS path or an empty prop left
  // unguarded renders `<a href="">`, which reloads the current page — a link that looks live and
  // silently sends the visitor nowhere, on the one piece of chrome that exists for legal reasons.
  const cms = typeof fromCms === 'string' ? fromCms.trim() : ''
  if (cms) return cms

  const project = typeof fromProject === 'string' ? fromProject.trim() : ''

  return project || null
}

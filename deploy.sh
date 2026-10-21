#!/usr/bin/env bash
#
# The build/release half of the deploy this package's own repo root deploy.sh
# hands off to — reached via `exec bash node_modules/@rocksoft/cms-starter-core/deploy.sh`
# once that file's own layout detection, lock and `pnpm install` are done
# (dashboard #1195 step 8). Shipping this here, rather than as a copy at every
# client repo's root, means a fix to build/release/verify/go-live/prune/history
# reaches every client via a core pin bump instead of a per-repo GitHub sync —
# which used to be the ONLY way a fix like #969's could reach an already-live
# client (see ClientRepositoryStamper::syncDeployScript() in the panel repo).
#
# This file is never invoked directly: it always runs as a `bash`-exec'd child
# of the wrapper, which computed and exported every input below — including
# RELEASE_NAME and WRAPPER_COMMIT_SHA, so this half reports the exact same
# release name and commit the wrapper already announced, not values it
# recomputed itself a moment later. Its own physical location (inside
# node_modules/@rocksoft/cms-starter-core, in EVERY case — the monorepo's own
# build reaches it through the pnpm workspace symlink) carries no layout
# signal, so nothing here may re-derive DEPLOY_ROOT/FRONTEND_DIR/LAYOUT from
# $0 the way the wrapper does; each required input below fails loudly instead.
set -Eeuo pipefail

: "${DEPLOY_ROOT:?deploy.sh (core) requires DEPLOY_ROOT, set by the wrapper}"
: "${FRONTEND_DIR:?deploy.sh (core) requires FRONTEND_DIR, set by the wrapper}"
: "${LAYOUT:?deploy.sh (core) requires LAYOUT, set by the wrapper}"
: "${RELEASES_DIR:?deploy.sh (core) requires RELEASES_DIR, set by the wrapper}"
: "${PUBLIC_HTML:?deploy.sh (core) requires PUBLIC_HTML, set by the wrapper}"
: "${RELEASE_NAME:?deploy.sh (core) requires RELEASE_NAME, set by the wrapper}"
: "${KEEP_RELEASES:?deploy.sh (core) requires KEEP_RELEASES, set by the wrapper}"
: "${VERIFY_PATHS:?deploy.sh (core) requires VERIFY_PATHS, set by the wrapper}"
SITE_URL="${SITE_URL:-}"
commit_sha="${WRAPPER_COMMIT_SHA:-unknown}"
wrapper_elapsed="${WRAPPER_ELAPSED:-0}"

# $DEPLOY_ROOT/.preview-ref (dashboard client code acceptance): one line `<40-hex sha> <branch>`
# the panel writes right before it triggers a CODE preview build, asking for that commit to be
# built instead of the checkout. Consumed (deleted) by EVERY run, before anything else can refuse
# it: a file left behind must never steer a later, unrelated deploy. It only means something in
# preview mode (resolved below); a live deploy deletes and ignores it.
preview_ref_line=""
preview_ref_found=0
if [ -f "$DEPLOY_ROOT/.preview-ref" ]; then
  preview_ref_found=1
  IFS= read -r preview_ref_line < "$DEPLOY_ROOT/.preview-ref" 2>/dev/null || true
  rm -f "$DEPLOY_ROOT/.preview-ref"
fi

# PREVIEW=1 (dashboard preview sessions): the same build, package and verify, but the release is
# parked behind preview_html and public_html is never touched.
#
# The panel opens a SESSION, not a per-build request: while $DEPLOY_ROOT/.preview-mode exists and its
# epoch has not passed, every deploy that reaches this file — the panel's own build or a GitHub
# webhook push — is parked. A per-build switch raced with the webhook (which could consume it and flip
# live mid-session), and the RunCloud deployment script is a frozen contract that cannot carry one
# anyway. The file belongs to the panel (it removes it when the session ends); the epoch is the
# safety net, so a panel that died mid-session cannot freeze live forever. An explicit PREVIEW=0/1
# in the environment wins over the file (manual runs).
if [ -z "${PREVIEW:-}" ] && [ -f "$DEPLOY_ROOT/.preview-mode" ]; then
  # First line only, and exactly ten digits (an epoch in SECONDS until 2286): a millisecond value or
  # an absurdly long number would park every deploy for millennia (or overflow the comparison below
  # and silently deploy LIVE), so anything else is refused, never guessed at. The read tolerates the
  # panel removing the file between the test above and here.
  mode_expiry=""
  IFS= read -r mode_expiry < "$DEPLOY_ROOT/.preview-mode" 2>/dev/null || true
  mode_expiry="$(printf '%s' "$mode_expiry" | tr -d '[:space:]')"
  case "$mode_expiry" in
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]) ;;
    *)
      echo "deploy.sh (core): $DEPLOY_ROOT/.preview-mode must hold one epoch in seconds (10 digits), got '$mode_expiry' — refusing to guess between a preview and a live deploy" >&2
      exit 1
      ;;
  esac
  if [ "$mode_expiry" -gt "$(date +%s)" ]; then PREVIEW=1; fi
fi
# Anything but 0/1 is refused rather than guessed at: a typo like PREVIEW=true must not quietly
# become a LIVE deploy.
case "${PREVIEW:-0}" in
  0 | '') PREVIEW=0 ;;
  1) ;;
  *)
    echo "deploy.sh (core): PREVIEW must be 0 or 1, got '$PREVIEW' — refusing to guess between a preview and a live deploy" >&2
    exit 1
    ;;
esac
PREVIEW_HTML="$DEPLOY_ROOT/preview_html"
PREVIEW_MARKER="$DEPLOY_ROOT/.preview-release"
# Every release parked during the current session, newest last. The preview host can serve any of
# them (`?build=<release>`), so prune keeps them for as long as the session file exists; once the
# session ends they age out like any other release.
PREVIEW_LIST="$DEPLOY_ROOT/.preview-releases"
PREVIEW_LIST_MAX=10
# SITE_URL names the LIVE site. A preview has no flip to smoke-test, so it must never probe it.
if [ "$PREVIEW" = "1" ]; then SITE_URL=""; fi

log() { echo "[$(date +%H:%M:%S)] $*"; }

# Own copy of the wrapper's step tracking: SECONDS restarts at 0 in this
# process (a fresh `bash` after `exec`), so per-step timing here is naturally
# correct without any handoff; only the FINAL total needs wrapper_elapsed
# added back in (see the last log line below).
step="build"
step_started=$SECONDS
begin() {
  step="$1"
  step_started=$SECONDS
  log "==> $step"
}
finish() { log "    $step ok ($((SECONDS - step_started))s)"; }

fail() {
  local code=$? line=$1
  log "!!! deploy FAILED during \"$step\" (line $line, exit $code) after $((wrapper_elapsed + SECONDS - step_started))s"
  log "    public_html still -> $(readlink "$PUBLIC_HTML" 2>/dev/null || echo 'unset') — previous release stays live"
  exit "$code"
}
trap 'fail "$LINENO"' ERR

# The wrapper already `cd`'d here before exec (cwd survives exec), but this
# file must be correct if it is ever read on its own — never rely on an
# inherited cwd silently matching what the contract above promises.
cd "$FRONTEND_DIR"

RELEASE_PATH="$RELEASES_DIR/$RELEASE_NAME"

# A committed node_modules survives every deploy on this host, and so does Vite's dependency-
# optimizer cache inside it (node_modules/.vite) — unlike a fresh CI checkout, which never has
# one. scripts/load-cms-config.mjs (used by verify-block-coverage.mjs, first thing pnpm build
# runs) spins up a throwaway Vite server per invocation and closes it immediately; once that
# cache exists from a PRIOR deploy, the next run can detect it as stale, try to re-optimize, and
# that re-optimization can crash the whole build near-instantly with no error output ("[vite]
# scanning dependencies..." then exit 1) — reproduced consistently once the cache was warm
# (diligently-dashboard#2117). load-cms-config.mjs's own fix (disabling that unused optimizer)
# should make this moot, but it is unverified on an actual host — Windows never reproduces the
# race — so this stays as a cheap, unconditional belt-and-suspenders.
rm -rf node_modules/.vite

# Code previews (.preview-ref, consumed at the top). The ref is built in a throwaway detached
# worktree under .preview-src/<release>; the checkout itself, its node_modules and public_html are
# never touched. Whatever an earlier run left there (killed mid-build, so its trap never ran) is
# debris: this run holds the wrapper's deploy lock, so no other build can be using it.
PREVIEW_SRC_ROOT="$DEPLOY_ROOT/.preview-src"
if [ -d "$PREVIEW_SRC_ROOT" ]; then
  rm -rf "$PREVIEW_SRC_ROOT"
  git -C "$DEPLOY_ROOT" worktree prune 2>/dev/null || true
fi
preview_ref_sha=""
if [ "$preview_ref_found" = "1" ] && [ "$PREVIEW" != "1" ]; then
  # Live is never built from a ref, whatever the file says.
  log "    .preview-ref ignored (not a preview deploy) and removed"
elif [ "$preview_ref_found" = "1" ]; then
  begin "preview ref"
  # An unusable line fails the preview: falling back to the checkout would show the client a
  # preview of something other than the change they are about to accept.
  ref_sha="" ref_branch="" ref_extra=""
  read -r ref_sha ref_branch ref_extra <<< "$preview_ref_line" || true
  if ! [[ "$ref_sha" =~ ^[0-9a-f]{40}$ ]] || [ -z "$ref_branch" ] || [ -n "$ref_extra" ] \
    || [[ "$ref_branch" == -* ]] || [[ "$ref_branch" =~ [^A-Za-z0-9._/-] ]] \
    || ! git check-ref-format "refs/heads/$ref_branch"; then
    log "    .preview-ref must be one line '<40-hex sha> <branch>', got '$preview_ref_line' — refusing to build a preview of anything else"
    exit 1
  fi
  # The branch is only how to reach the commit; the sha is what was asked for. A branch that has
  # moved on since the panel read it would build a commit nobody looked at, so it is refused.
  git -C "$DEPLOY_ROOT" fetch --quiet --no-tags origin "refs/heads/$ref_branch"
  fetched="$(git -C "$DEPLOY_ROOT" rev-parse FETCH_HEAD)"
  if [ "$fetched" != "$ref_sha" ]; then
    log "    origin/$ref_branch is at $fetched, not the requested $ref_sha — refusing (the branch moved; preview again)"
    exit 1
  fi
  # Dependencies must be exactly the checkout's (defence in depth: the panel already refuses a code
  # preview whose PR touches them). The ref is then installed OFFLINE from the pnpm store the checkout's
  # own install filled: nothing new is downloaded, and no package (or install script) runs that the
  # live site's install has not already run. A change to any manifest, lockfile or package-manager
  # config needs a developer's review, not a client preview.
  if ! git -C "$DEPLOY_ROOT" diff --quiet HEAD "$ref_sha" -- \
    ':(glob)**/package.json' ':(glob)**/pnpm-lock.yaml' ':(glob)**/package-lock.json' ':(glob)**/yarn.lock' \
    ':(glob)**/.npmrc' ':(glob)**/pnpm-workspace.yaml' ':(glob)**/.pnpmfile.cjs'; then
    log "    $ref_sha changes dependency files (package.json, a lockfile or package-manager config) against the checkout — refusing: a developer must review that change"
    exit 1
  fi
  preview_src="$PREVIEW_SRC_ROOT/$RELEASE_NAME"
  # Always removed, whether the build succeeds or not (the ERR trap's exit runs this too).
  cleanup_preview_src() {
    cd "$DEPLOY_ROOT" 2>/dev/null || true
    git -C "$DEPLOY_ROOT" worktree remove --force "$preview_src" >/dev/null 2>&1 || true
    rm -rf "$preview_src"
    git -C "$DEPLOY_ROOT" worktree prune 2>/dev/null || true
  }
  trap cleanup_preview_src EXIT
  mkdir -p "$PREVIEW_SRC_ROOT"
  git -C "$DEPLOY_ROOT" worktree add --quiet --detach "$preview_src" "$ref_sha"
  # The same frontend dir inside the worktree as in the checkout (frontend/ in the monorepo).
  preview_frontend="$preview_src${FRONTEND_DIR#"$DEPLOY_ROOT"}"
  if [ -f "$FRONTEND_DIR/.env" ]; then
    cp "$FRONTEND_DIR/.env" "$preview_frontend/.env"
  else
    log "    WARN     no .env at $FRONTEND_DIR — any build step needing API credentials will fail"
  fi
  log "    building $ref_sha ($ref_branch) in .preview-src/$RELEASE_NAME"
  finish
  cd "$preview_frontend"
  # The wrapper's install rule (frozen when a lockfile exists, --no-lockfile otherwise or when it is
  # stale), but --offline: the dependencies are the checkout's (checked above), so the store already
  # holds every package and nothing is fetched. Not --ignore-scripts: those are the same install
  # scripts the live install ran, and packages such as esbuild and sharp need theirs to work.
  if [ -f pnpm-lock.yaml ]; then
    begin "pnpm install --frozen-lockfile --offline (preview ref)"
    if pnpm install --frozen-lockfile --offline; then
      finish
    else
      log "    lockfile does not match package.json — falling back"
      begin "pnpm install --no-lockfile --offline (preview ref, stale lockfile)"
      pnpm install --no-lockfile --offline
      finish
    fi
  else
    begin "pnpm install --no-lockfile --offline (preview ref, no committed lockfile)"
    pnpm install --no-lockfile --offline
    finish
  fi
  preview_ref_sha="$ref_sha"
fi

# ASTRO_PREVIEW=1 marks a preview build for a future reader; nothing in core reads it today. A
# preview release is published as-is, so it must not differ from a live build (no noindex: the
# preview host withholds itself from search engines instead). A value leaked from the caller's
# shell is cleared, so only a real preview build ever carries it.
unset ASTRO_PREVIEW
begin "pnpm build"
if [ "$PREVIEW" = "1" ]; then
  log "    PREVIEW=1 — preview build, public_html stays where it is"
  ASTRO_PREVIEW=1 pnpm build
else
  pnpm build
fi
finish

# Isolate this build into its own release dir. `set -e` means a failed build never
# reaches here, so the previous release stays live.
begin "package release"
if [ ! -d dist ]; then
  log "    build produced no dist/ — aborting (previous release stays live)"
  exit 1
fi
# Output census. A build can exit 0 and still be wrong — an API returning an
# empty page set yields a valid site with two pages in it. Logging the count on
# every deploy makes that visible by comparison with the previous one, which a
# pass/fail check on a single file cannot do.
pages="$(find dist -type f -name '*.html' | wc -l | tr -d ' ')"
files="$(find dist -type f | wc -l | tr -d ' ')"
log "    $pages page(s), $files file(s), $(du -sh dist 2>/dev/null | cut -f1)"
mv dist "$RELEASE_PATH"

# Verify critical output BEFORE going live. If the build silently dropped a file,
# discard this release and leave the symlink on the previous good one.
for f in $VERIFY_PATHS; do
  if [ ! -f "$RELEASE_PATH/$f" ]; then
    log "    verify FAILED: missing $f — discarding release, not switching symlink"
    rm -rf "$RELEASE_PATH"
    exit 1
  fi
done
log "    verify OK ($VERIFY_PATHS present)"
finish

# Flip atomically. `ln -sfn` replaces the symlink in a single syscall — there is no
# window where public_html is missing.
if [ "$PREVIEW" = "1" ]; then
  # Parked, not live. The marker is what the panel reads to learn which release the preview is;
  # written via a temp file so a reader never sees a half-written name.
  begin "park preview"
  ln -sfn "$RELEASE_PATH" "$PREVIEW_HTML"
  printf '%s\n' "$RELEASE_NAME" > "$PREVIEW_MARKER.tmp"
  mv "$PREVIEW_MARKER.tmp" "$PREVIEW_MARKER"
  # The panel empties the list when a session starts. Capped, so a session that builds all
  # afternoon cannot keep the disk from ever being pruned.
  { cat "$PREVIEW_LIST" 2>/dev/null || true; printf '%s\n' "$RELEASE_NAME"; } | tail -n "$PREVIEW_LIST_MAX" > "$PREVIEW_LIST.tmp"
  mv "$PREVIEW_LIST.tmp" "$PREVIEW_LIST"
  log "    preview_html -> releases/$RELEASE_NAME (public_html untouched: $(readlink "$PUBLIC_HTML" 2>/dev/null || echo 'unset'))"
else
  begin "go live"
  ln -sfn "$RELEASE_PATH" "$PUBLIC_HTML"
  log "    public_html -> releases/$RELEASE_NAME"
fi

# Attribute this release to the panel build that triggered it (#701). The panel writes
# .build-id before Force Deploy; move it to .build-ids/<release> (kept OUTSIDE public_html,
# never served) so FrontendReleases can match the completed build to the release IT produced
# rather than to a concurrent push auto-deploy. Guarded + post-flip, so it never affects go-live.
if [ -f "$DEPLOY_ROOT/.build-id" ]; then
  mkdir -p "$DEPLOY_ROOT/.build-ids"
  mv "$DEPLOY_ROOT/.build-id" "$DEPLOY_ROOT/.build-ids/$RELEASE_NAME"
fi

# Post-flip smoke test (warn-only: nginx/opcache may lag the switch by a moment).
# The status code and timing are logged rather than just pass/fail — 502, 404 and
# a 20s timeout are three different problems with three different fixes.
if [ -n "$SITE_URL" ]; then
  smoke="$(curl -s -o /dev/null -w 'HTTP %{http_code} in %{time_total}s' --max-time 20 "$SITE_URL" || echo 'no response (curl failed)')"
  case "$smoke" in
    'HTTP 2'*) log "    smoke OK   $SITE_URL — $smoke" ;;
    *)         log "    smoke WARN $SITE_URL — $smoke" ;;
  esac
fi

# Does the world actually get the robots.txt this release contains, and does the sitemap it
# advertises answer? The build can publish a perfectly correct file and still not be what a
# crawler fetches, and nothing until now compared the two. Warn-only, after the flip, never
# affects go-live; the `[robots]` prefix puts both lines in frontend_build_status.warnings and
# on the panel's Frontend Deploys page (dashboard #2064).
#
# Deliberately NOT cache-busted: the point is to see the copy the public address really serves.
if [ -n "$SITE_URL" ] && [ -f "$RELEASE_PATH/robots.txt" ]; then
  published="$(curl -s --max-time 20 "$SITE_URL/robots.txt" || true)"

  if [ -z "$published" ]; then
    log "    [robots] $SITE_URL/robots.txt answers HTTP nothing — the public address served no robots.txt at all"
  elif [ "$published" != "$(cat "$RELEASE_PATH/robots.txt")" ]; then
    log "    [robots] public robots.txt at $SITE_URL differs from this release's — something in front of the origin is serving an older copy, and crawlers see that one; purge /robots.txt there or shorten its TTL (runbook: caches in front of the origin)"
  else
    log "    robots OK  $SITE_URL/robots.txt matches this release"
  fi

  # The line is only worth anything if the address it names answers. Read from the RELEASE, not
  # from what was served, so a stale cached copy is reported once (above) and not twice.
  sitemap_url="$(sed -n 's/^[Ss]itemap:[[:space:]]*//p' "$RELEASE_PATH/robots.txt" | head -n 1)"
  if [ -n "$sitemap_url" ]; then
    sitemap_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$sitemap_url" || echo 000)"
    case "$sitemap_code" in
      2*) log "    robots OK  sitemap advertised at $sitemap_url answers HTTP $sitemap_code" ;;
      *)  log "    [robots] sitemap advertised at $sitemap_url answers HTTP $sitemap_code" ;;
    esac
  fi
fi
finish

# Prune: keep the newest $KEEP_RELEASES, never one something still points at. `ls -dt` orders
# newest-first; everything past the keep count is removed. Protected: this release (live after a
# live deploy, parked after a preview); whatever public_html serves (a preview deploy has NOT
# flipped it, so it is no longer this release); and whatever preview_html points at (a live deploy
# during a preview session must not delete the build the client is looking at); and, while a session
# file exists, every release parked during that session ($PREVIEW_LIST — the host can serve any).
protected_live="$RELEASE_NAME"
prune=1
if [ "$PREVIEW" = "1" ]; then
  protected_live="$(basename "$(readlink "$PUBLIC_HTML" 2>/dev/null || true)")"
  # Nothing to compare against (first deploy, or a platform where ln -s copies): pruning blind
  # could delete the live release, while keeping one extra costs a few MB.
  if [ -z "$protected_live" ]; then
    prune=0
    log "    prune skipped: cannot tell which release is live"
  fi
fi
protected_preview=""
if [ -L "$PREVIEW_HTML" ]; then
  protected_preview="$(basename "$(readlink "$PREVIEW_HTML")")"
elif [ -f "$PREVIEW_MARKER" ]; then
  protected_preview="$(cat "$PREVIEW_MARKER")"
fi
if [ "$prune" = "1" ]; then
  # shellcheck disable=SC2012
  ls -1dt "$RELEASES_DIR"/*/ 2>/dev/null | tail -n "+$((KEEP_RELEASES + 1))" | while read -r old; do
    name="$(basename "$old")"
    [ "$name" = "$RELEASE_NAME" ] && continue
    [ "$name" = "$protected_live" ] && continue
    [ -n "$protected_preview" ] && [ "$name" = "$protected_preview" ] && continue
    [ -f "$DEPLOY_ROOT/.preview-mode" ] && [ -f "$PREVIEW_LIST" ] && grep -qxF "$name" "$PREVIEW_LIST" && continue
    log "    prune releases/$name"
    rm -rf "$old"
    rm -f "$DEPLOY_ROOT/.build-ids/$name" # drop the pruned release's build-id tag (#701)
  done
fi

# One line per deploy, kept OUTSIDE public_html so it is never served. RunCloud's
# UI keeps only the most recent deploy log, so this is the only thing that can
# answer "which commit has been live since when?" after the fact — including for
# the older releases still on disk that a rollback might jump back to. Duration
# is the TRUE total (wrapper_elapsed + this process's own SECONDS), not just the
# portion since the handoff.
total_elapsed=$((wrapper_elapsed + SECONDS))
# A preview line carries a trailing mode=preview field; live lines keep their exact old shape so
# nothing that parses them has to change.
history_mode=""
final_tag=""
if [ "$PREVIEW" = "1" ]; then
  history_mode=$'\tmode=preview'
  final_tag=" [preview]"
fi
# A code preview (.preview-ref) built another commit than the checkout: commit= names what was
# really built, and ref= carries the full sha the panel asked for (it matches the build on it).
if [ -n "$preview_ref_sha" ]; then
  commit_sha="$(git -C "$DEPLOY_ROOT" rev-parse --short "$preview_ref_sha")"
  history_mode="$history_mode"$'\tref='"$preview_ref_sha"
  final_tag="$final_tag ref=$preview_ref_sha"
fi
printf '%s\trelease=%s\tcommit=%s\tpages=%s\tduration=%ss%s\n' \
  "$(date -Iseconds)" "$RELEASE_NAME" "$commit_sha" "$pages" "$total_elapsed" "$history_mode" \
  >> "$DEPLOY_ROOT/.deploy-history"

log "Deployed: $RELEASE_NAME ($commit_sha), $pages page(s), ${total_elapsed}s total$final_tag"

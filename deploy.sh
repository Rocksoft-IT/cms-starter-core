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

begin "pnpm build"
pnpm build
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
begin "go live"
ln -sfn "$RELEASE_PATH" "$PUBLIC_HTML"
log "    public_html -> releases/$RELEASE_NAME"

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
finish

# Prune: keep the newest $KEEP_RELEASES, never the currently-live one. `ls -dt`
# orders newest-first; everything past the keep count is removed. The live release
# is the one we just flipped to, so guard on $RELEASE_NAME directly.
live="$RELEASE_NAME"
# shellcheck disable=SC2012
ls -1dt "$RELEASES_DIR"/*/ 2>/dev/null | tail -n "+$((KEEP_RELEASES + 1))" | while read -r old; do
  name="$(basename "$old")"
  [ "$name" = "$live" ] && continue
  log "    prune releases/$name"
  rm -rf "$old"
  rm -f "$DEPLOY_ROOT/.build-ids/$name" # drop the pruned release's build-id tag (#701)
done

# One line per deploy, kept OUTSIDE public_html so it is never served. RunCloud's
# UI keeps only the most recent deploy log, so this is the only thing that can
# answer "which commit has been live since when?" after the fact — including for
# the older releases still on disk that a rollback might jump back to. Duration
# is the TRUE total (wrapper_elapsed + this process's own SECONDS), not just the
# portion since the handoff.
total_elapsed=$((wrapper_elapsed + SECONDS))
printf '%s\trelease=%s\tcommit=%s\tpages=%s\tduration=%ss\n' \
  "$(date -Iseconds)" "$RELEASE_NAME" "$commit_sha" "$pages" "$total_elapsed" \
  >> "$DEPLOY_ROOT/.deploy-history"

log "Deployed: $RELEASE_NAME ($commit_sha), $pages page(s), ${total_elapsed}s total"

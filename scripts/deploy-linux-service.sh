#!/usr/bin/env bash
# Deploy this checkout to the Linux systemd user service install
# (default ~/.local/share/ompweb/app). The checkout is the only source; the
# install dir only holds a built copy with Linux dependencies.
#
#   scripts/deploy-linux-service.sh switch   build if needed, then stop the service, swap the build in, start it again
#   scripts/deploy-linux-service.sh          stage only: copy the working tree, install deps, build in <root>/staging
#
# `switch` alone is enough: it reuses <root>/staging when that was built from
# the current working tree (and live .env.local), otherwise it stages first.
# Building happens while the old service keeps running; only the swap stops
# it. `switch` restarts the service: run it only when no agent task is running.
# `stage` never touches the running app, so it is safe while agents work and
# makes the later `switch` a quick restart.
# Unchanged by a deploy: the systemd unit, ~/.omp/agent/web-service.env, and the
# live app's .env.local (copied into the new build).
#
# Overrides: OMPWEB_INSTALL_ROOT (default ~/.local/share/ompweb),
# OMPWEB_SERVICE (default ompweb.service), OMPWEB_KEEP_BACKUPS (default 2).
set -euo pipefail
umask 077

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="${OMPWEB_INSTALL_ROOT:-$HOME/.local/share/ompweb}"
APP="$ROOT/app"
STAGE="$ROOT/staging"
SERVICE="${OMPWEB_SERVICE:-ompweb.service}"
KEEP_BACKUPS="${OMPWEB_KEEP_BACKUPS:-2}"
# Records the lockfile the install's node_modules was built from.
LOCK_MARKER=".deploy-package-lock.json"

die() { echo "deploy: $*" >&2; exit 1; }

# Build with the same Node runtime the service runs on.
shopt -s nullglob
node_bins=("$ROOT"/runtime/node-*/bin)
shopt -u nullglob
[[ ${#node_bins[@]} -eq 1 && -x "${node_bins[0]}/node" ]] \
  || die "expected exactly one Node runtime under $ROOT/runtime"
export PATH="${node_bins[0]}:$PATH"

# Fingerprint of everything stage copies: the content of every tracked and
# untracked-but-not-ignored file (deleted tracked files drop out), plus the
# live .env.local carried into the build.
tree_hash() {
  {
    git -C "$SRC" ls-files -z -co --exclude-standard | LC_ALL=C sort -z \
      | (cd "$SRC" && xargs -0 -r sha256sum -- 2>/dev/null) || true
    if [[ -f "$APP/.env.local" ]]; then sha256sum "$APP/.env.local"; fi
  } | sha256sum | cut -d' ' -f1
}

stage() {
  local tree
  # Taken before copying: an edit during the copy then forces a re-stage.
  tree="$(tree_hash)"
  rm -rf "$STAGE"
  mkdir -p "$STAGE"

  # Tracked and untracked-but-not-ignored files: the working tree as Git sees
  # it, including uncommitted work. No -p: the checkout may sit on NTFS, where
  # every file reports 0755; the umask above applies instead.
  git -C "$SRC" ls-files -z -co --exclude-standard \
    | rsync -rlt --from0 --files-from=- --ignore-missing-args "$SRC/" "$STAGE/"

  if [[ -f "$APP/.env.local" ]]; then
    cp -p "$APP/.env.local" "$STAGE/.env.local"
  elif [[ -f "$SRC/.env.local" ]]; then
    cp "$SRC/.env.local" "$STAGE/.env.local"
  fi

  if [[ -d "$APP/node_modules" ]] && cmp -s "$STAGE/package-lock.json" "$APP/$LOCK_MARKER"; then
    echo "deploy: lockfile unchanged, reusing the installed node_modules"
    cp -a "$APP/node_modules" "$STAGE/node_modules"
  else
    echo "deploy: installing dependencies (npm ci)"
    # Dev dependencies are build inputs; NODE_ENV=production would drop them.
    (cd "$STAGE" && env -u NODE_ENV npm ci --no-audit --no-fund)
  fi
  cp "$STAGE/package-lock.json" "$STAGE/$LOCK_MARKER"

  # Carry the live build's webpack cache over: next build only recompiles what
  # changed instead of starting cold. A copy, not a link, so the build never
  # writes into the running app.
  if [[ -d "$APP/.next/cache" ]]; then
    mkdir -p "$STAGE/.next"
    cp -a "$APP/.next/cache" "$STAGE/.next/cache"
  fi

  echo "deploy: building"
  (cd "$STAGE" && NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 npm run build)

  {
    echo "source: $SRC"
    echo "commit: $(git -C "$SRC" rev-parse HEAD)"
    echo "uncommitted changes: $(git -C "$SRC" status --porcelain | wc -l)"
    echo "tree: $tree"
    echo "staged: $(date -Iseconds)"
  } > "$STAGE/.deploy-source"

  echo "deploy: staged at $STAGE"
}

switch() {
  if [[ -f "$STAGE/.next/BUILD_ID" ]] && grep -qxF "tree: $(tree_hash)" "$STAGE/.deploy-source" 2>/dev/null; then
    echo "deploy: staged build matches the working tree, reusing it"
  else
    echo "deploy: no staged build of the current working tree, staging first (the service keeps running)"
    stage
  fi
  [[ -f "$STAGE/.next/BUILD_ID" ]] || die "no staged build at $STAGE"
  [[ -d "$APP" ]] || die "no current install at $APP"
  local backup
  # Nanoseconds: two switches within one second must not share a backup dir.
  backup="$ROOT/backups/deploy-$(date +%Y%m%d-%H%M%S-%N)"
  mkdir -p "$ROOT/backups"
  mkdir "$backup"

  # The running server reads .next by path, so the swap happens while stopped.
  systemctl --user stop "$SERVICE"
  if ! mv "$APP" "$backup/app"; then
    systemctl --user start "$SERVICE"
    die "could not move $APP aside; the previous build was restarted"
  fi
  if ! mv "$STAGE" "$APP"; then
    mv "$backup/app" "$APP"
    systemctl --user start "$SERVICE"
    die "could not move $STAGE into place; the previous build was restarted"
  fi
  systemctl --user start "$SERVICE"

  echo "deploy: switched; previous build kept at $backup/app"
  echo "deploy: rollback: systemctl --user stop $SERVICE && mv $APP $ROOT/staging && mv $backup/app $APP && systemctl --user start $SERVICE"

  # Each backup holds a full node_modules and .next; keep only the newest few.
  local old
  while IFS= read -r old; do
    rm -rf "$old"
  done < <(find "$ROOT/backups" -maxdepth 1 -type d -name 'deploy-*' | sort | head -n "-$KEEP_BACKUPS")
}

case "${1:-stage}" in
  stage) stage; echo "deploy: when no agent task is running, run: $0 switch" ;;
  switch) switch ;;
  *) die "usage: $0 [stage|switch]" ;;
esac

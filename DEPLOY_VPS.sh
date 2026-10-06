#!/usr/bin/env bash
# Build in isolation, preserve environment/backend, publish index.html LAST.
set -Eeuo pipefail
SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ $# -lt 1 || ! -d "$1/frontend" ]]; then
  echo 'Usage: bash DEPLOY_VPS.sh /absolute/path/to/existing-project [https://api.example.com]'
  echo 'The existing Nginx root must point to that project/frontend/build.'
  exit 2
fi
TARGET="$(cd -- "$1" && pwd)"
API_ORIGIN="${2-}"
[[ "$TARGET" != "$SOURCE" ]] || { echo 'Extract this update separately from your live project.'; exit 2; }
for cmd in node npm rsync tar; do command -v "$cmd" >/dev/null || { echo "Missing $cmd. Install it, then retry."; exit 2; }; done
[[ -f "$TARGET/frontend/package.json" && -f "$SOURCE/frontend/src/App.js" ]] || { echo 'React project files not found.'; exit 2; }
[[ ! -L "$TARGET/frontend/build" ]] || { echo 'Your build is a symlink/release deployment. Use your existing release procedure with this frontend source.'; exit 2; }
if command -v nginx >/dev/null; then nginx -t; fi
STAMP="$(date +%Y%m%d-%H%M%S)-$$"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/neksathi-build.XXXXXX")"
trap 'rm -rf -- "$STAGE"' EXIT
rsync -a --exclude=node_modules --exclude=build --exclude=.git --exclude=android --exclude=ios --exclude='.env' --exclude='.env.local' --exclude='.env.production' --exclude='.env.production.local' "$SOURCE/frontend/" "$STAGE/"
for f in .env .env.local .env.production .env.production.local; do
  if [[ -f "$TARGET/frontend/$f" ]]; then install -m 600 "$TARGET/frontend/$f" "$STAGE/$f"; fi
done
cd "$STAGE"
if [[ -x "$TARGET/frontend/node_modules/.bin/craco" && "${NEKSATHI_FRESH_INSTALL:-0}" != 1 ]]; then
  ln -s "$TARGET/frontend/node_modules" "$STAGE/node_modules"
  echo '[1/4] Reusing your installed packages; no dependency upgrade.'
else
  echo '[1/4] Installing dependencies in the staging folder...'
  # Original npm peer compatibility retained; do not run audit fix --force.
  if [[ -f package-lock.json ]]; then npm ci --include=dev --no-audit --no-fund; else npm install --include=dev --no-audit --no-fund; fi
fi
node scripts/check-assets.cjs
printf '\n[2/4] Building the actual React app. The live website is unchanged during this step.\n'
# An empty origin deliberately uses this website's existing /api proxy.
REACT_APP_BACKEND_URL="$API_ORIGIN" BUILD_PATH=build GENERATE_SOURCEMAP=false ENABLE_VISUAL_EDITS=false ENABLE_HEALTH_CHECK=false npm run build
[[ -s build/index.html && -d build/static/js ]] || { echo 'No valid React build produced. Nothing deployed.'; exit 1; }
BACKUP_DIR="$(dirname "$TARGET")/.neksathi-backups"
(umask 077; mkdir -p "$BACKUP_DIR")
BACKUP="$BACKUP_DIR/frontend-$STAMP.tar.gz"
echo '[3/4] Backing up existing frontend, including .env and the previous build...'
(umask 077; tar --exclude='frontend/node_modules' --exclude='frontend/android/.gradle' --exclude='frontend/android/app/build' --exclude='frontend/ios/App/Pods' --exclude='frontend/.git' -czf "$BACKUP" -C "$TARGET" frontend)
echo '[4/4] Publishing compiled assets, then switching the entry point...'
mkdir -p "$TARGET/frontend/build"
# Do not delete old hashed chunks: already-open browser tabs may still need them.
rsync -a --chmod=D755,F644 --exclude=index.html build/ "$TARGET/frontend/build/"
# Source update excludes backend, native projects, local env, installed packages and build.
rsync -a --exclude=node_modules --exclude=build --exclude=.git --exclude=android --exclude=ios --exclude='.env*' "$SOURCE/frontend/" "$TARGET/frontend/"
install -m 644 build/index.html "$TARGET/frontend/build/.index-next-$STAMP"
mv -f -- "$TARGET/frontend/build/.index-next-$STAMP" "$TARGET/frontend/build/index.html"
echo
printf 'Frontend deployed to: %s/frontend/build\nBackup: %s\n' "$TARGET" "$BACKUP"
echo 'Backend, database, Nginx configuration, .env and native projects were not replaced.'
echo 'No backend restart is needed for this frontend update. Open the site and hard-refresh.'
echo 'For rollback: bash ROLLBACK_VPS.sh /path/to/project /path/to/backup.tar.gz'

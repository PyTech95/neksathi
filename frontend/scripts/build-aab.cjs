/** FULL command-line build of a signed Play Store AAB — one command:
 *
 *   node scripts/build-aab.cjs
 *
 * It runs, in order: web build -> cap sync -> apply native sources ->
 * auto-bump versionCode (+1) and versionName patch -> gradlew bundleRelease.
 * The signed .aab lands in:
 *   android/app/build/outputs/bundle/release/app-release.aab
 *
 * Signing uses your existing android/keystore.properties + neksathi-upload-key.jks
 * — this script never reads, prints, moves or needs the keystore or its password.
 * Needs: JDK 17+, Android SDK, and the keystore already set up in this folder
 * (same setup your Android Studio build uses).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const win = process.platform === 'win32';
const root = path.resolve(__dirname, '..');
const android = path.join(root, 'android');

function run(cmd, args, opts = {}) {
  console.log('\n> ' + cmd + ' ' + args.join(' '));
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: win, ...opts });
  if (r.status !== 0) {
    console.error('\n[x] step failed: ' + cmd + ' ' + args.join(' '));
    process.exit(r.status || 1);
  }
}

if (!fs.existsSync(android)) {
  console.error('android/ not found. Run this inside your FINAL ...\\frontend folder.');
  process.exit(1);
}

// 1) web build  2) copy web+plugins into android/  3) copy native java/res/manifest
run(win ? 'npm.cmd' : 'npm', ['run', 'build']);
run(win ? 'npx.cmd' : 'npx', ['--no-install', 'cap', 'sync', 'android']);
run('node', ['scripts/apply-native.cjs']);

// 4) bump versionCode (+1) and versionName patch so Play never rejects a reused code
const gradlePath = path.join(android, 'app', 'build.gradle');
let g = fs.readFileSync(gradlePath, 'utf8');
const vc = g.match(/versionCode\s+(\d+)/);
if (vc) {
  const next = parseInt(vc[1], 10) + 1;
  g = g.replace(/versionCode\s+\d+/, 'versionCode ' + next);
  console.log('\nversionCode: ' + vc[1] + ' -> ' + next);
} else {
  console.warn('\n[!] could not find versionCode in build.gradle — bump it by hand.');
}
const vn = g.match(/versionName\s+"(\d+)\.(\d+)\.(\d+)"/);
if (vn) {
  const name = vn[1] + '.' + vn[2] + '.' + (parseInt(vn[3], 10) + 1);
  g = g.replace(/versionName\s+"[^"]+"/, 'versionName "' + name + '"');
  console.log('versionName -> ' + name);
}
fs.writeFileSync(gradlePath, g);

// 5) signing sanity check — an unsigned AAB is rejected by Play
if (!fs.existsSync(path.join(android, 'keystore.properties'))) {
  console.warn('\n[!] android/keystore.properties NOT found — the AAB may build UNSIGNED and');
  console.warn('    Play Console will reject it. Put your keystore.properties in android/ first.');
}

// 6) build the signed release bundle
run(win ? 'gradlew.bat' : './gradlew', ['bundleRelease'], { cwd: android });

const out = path.join(android, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
console.log('\n[ok] Signed AAB ready:');
console.log('   ' + out);
console.log('Upload that .aab to Play Console.');

/** One command that prepares the Android project for a signed AAB, in the
 * right order — so the NATIVE changes (SOS auto-photo, siren, SIM alerts, call
 * handling) are never left out. The usual "it works on web but not in the app"
 * bug is forgetting `apply-native.cjs` after `cap sync`: this runs all three
 * steps for you.
 *
 *   node scripts/prepare-aab.cjs
 *
 * Then in Android Studio: bump versionCode, Build > Generate Signed Bundle /
 * APK > Android App Bundle (uses your keystore.properties). It never touches
 * google-services.json, the keystore or the app id.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const win = process.platform === 'win32';
const root = path.resolve(__dirname, '..');

function run(cmd, args) {
  console.log('\n> ' + cmd + ' ' + args.join(' '));
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: win });
  if (r.status !== 0) {
    console.error('\n[x] step failed: ' + cmd + ' ' + args.join(' '));
    process.exit(r.status || 1);
  }
}

// 1) build the web app  2) copy web + plugins into android/  3) copy the
// versioned native sources (java/res/manifest) into android/app.
run(win ? 'npm.cmd' : 'npm', ['run', 'build']);
run(win ? 'npx.cmd' : 'npx', ['--no-install', 'cap', 'sync', 'android']);
run('node', ['scripts/apply-native.cjs']);

console.log('\n[ok] Android project is ready.');
console.log('Next in Android Studio:');
console.log('  1. android/app/build.gradle -> bump versionCode (must be > 16) and versionName.');
console.log('  2. Build > Generate Signed Bundle / APK > Android App Bundle.');
console.log('  3. Pick neksathi-upload-key.jks, then upload the .aab to Play Console.');

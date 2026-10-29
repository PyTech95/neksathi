/** Copies the versioned native Android sources (frontend/native-android/) into
 * the generated Capacitor project (frontend/android/) and makes sure Firebase
 * Messaging is in app/build.gradle. Run after `npx cap add android` or
 * `npx cap sync android`, before `gradlew assembleDebug`:
 *
 *   node scripts/apply-native.cjs
 *
 * It never touches google-services.json, signing keys or the app id.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'native-android');
const android = path.join(root, 'android');
const app = path.join(android, 'app');
const main = path.join(app, 'src', 'main');

if (!fs.existsSync(android)) {
  console.error('android/ not found. Run `npx cap add android` first.');
  process.exit(1);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else { fs.copyFileSync(a, b); console.log('  ' + path.relative(root, b)); }
  }
}

console.log('Native sources -> android/app/src/main');
copyDir(path.join(src, 'java'), path.join(main, 'java'));
copyDir(path.join(src, 'res'), path.join(main, 'res'));
fs.copyFileSync(path.join(src, 'AndroidManifest.xml'), path.join(main, 'AndroidManifest.xml'));
console.log('  app/src/main/AndroidManifest.xml');

// Firebase Messaging dependency + google-services plugin (needed by
// CallMessagingService). Capacitor's push plugin brings the SDK transitively,
// but the app module must declare it to compile against RemoteMessage.
const gradlePath = path.join(app, 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
if (!gradle.includes('firebase-messaging')) {
  gradle = gradle.replace(/dependencies\s*\{/, (m) => m +
    "\n    implementation platform('com.google.firebase:firebase-bom:33.5.1')" +
    "\n    implementation 'com.google.firebase:firebase-messaging'");
  fs.writeFileSync(gradlePath, gradle);
  console.log('  app/build.gradle: added firebase-messaging');
}
// androidx.media = MediaSessionCompat + VolumeProviderCompat for volume-button SOS.
gradle = fs.readFileSync(gradlePath, 'utf8');
if (!gradle.includes('androidx.media:media')) {
  gradle = gradle.replace(/dependencies\s*\{/, (m) => m +
    "\n    implementation 'androidx.media:media:1.6.0'");
  fs.writeFileSync(gradlePath, gradle);
  console.log('  app/build.gradle: added androidx.media');
}
if (!gradle.includes('com.google.gms.google-services')) {
  console.log('  NOTE: app/build.gradle has no google-services plugin line; Capacitor adds it when google-services.json exists (try { apply plugin: ... }).');
}
if (!fs.existsSync(path.join(app, 'google-services.json'))) {
  console.log('  WARNING: android/app/google-services.json is missing - push and calls will not work. Download it from Firebase console (Android app com.neksathi.app).');
}
console.log('Done. Now: cd android && gradlew assembleDebug');

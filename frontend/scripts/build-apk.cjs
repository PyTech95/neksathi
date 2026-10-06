/** Local DEBUG APK builder for the original Capacitor 6 project.
 * Needs installed JDK 17+, Android SDK 34 and an internet connection on first run.
 * Never overwrites a signing key, app id, google-services.json or backend config.
 */
const fs = require('fs'); const path = require('path'); const https = require('https');
const crypto = require('crypto'); const {spawnSync} = require('child_process');
const root = path.resolve(__dirname,'..'); const win = process.platform==='win32';
function run(command,args,options={}) {
  const r=spawnSync(command,args,{cwd:root,stdio:'inherit',env:process.env,shell:win&&/\.(cmd|bat)$/.test(command),...options});
  if(r.error || r.status!==0) throw new Error(`${command} ${args.join(' ')} failed: ${r.error?.message || `exit ${r.status}`}`);
}
function get(url, redirects=0) {
  return new Promise((resolve,reject)=>{
    if(redirects>5) return reject(new Error('Too many redirects'));
    const parsed=new URL(url);if(parsed.protocol!=='https:')return reject(new Error('HTTPS required'));
    const req=https.get(parsed,{headers:{'User-Agent':'NekSathi-local-build'}},res=>{
      if([301,302,303,307,308].includes(res.statusCode)){res.resume();return get(new URL(res.headers.location,url).href,redirects+1).then(resolve,reject);}
      if(res.statusCode!==200){res.resume();return reject(new Error(`Download HTTP ${res.statusCode}: ${url}`));}
      const chunks=[];let size=0;
      res.on('data',b=>{size+=b.length;if(size>2e6){req.destroy(new Error('Unexpected large wrapper download'));return;}chunks.push(b);});
      res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject);
    });req.setTimeout(45000,()=>req.destroy(new Error('Download timed out')));req.on('error',reject);
  });
}
async function main(){
  const raw=process.env.NEKSATHI_API_ORIGIN || process.argv[2];
  if(!raw)throw new Error('Set NEKSATHI_API_ORIGIN to your real HTTPS backend origin. Do not use localhost for a phone.');
  const url=new URL(raw);
  if(url.protocol!=='https:' || ['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !['/','/api','/api/'].includes(url.pathname))throw new Error('Use a real public HTTPS origin, for example https://your-domain.com (optional /api).');
  const sdk=process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (win?path.join(process.env.LOCALAPPDATA||'','Android','Sdk'):path.join(process.env.HOME||'','Android','Sdk'));
  if(!fs.existsSync(sdk))throw new Error('Android SDK not found. Install Android Studio + Android SDK 34 and set ANDROID_HOME.');
  process.env.ANDROID_HOME=sdk;
  const java=process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME,'bin',win?'java.exe':'java') : 'java';
  run(java,['-version']);
  const npm=win?'npm.cmd':'npm';
  if(!fs.existsSync(path.join(root,'node_modules','@craco','craco')))run(npm,['install','--include=dev','--no-audit','--no-fund']);
  process.env.REACT_APP_BACKEND_URL=url.origin+(url.pathname.startsWith('/api')?'/api':'');
  process.env.BUILD_PATH='build';process.env.GENERATE_SOURCEMAP='false';process.env.ENABLE_VISUAL_EDITS='false';process.env.ENABLE_HEALTH_CHECK='false';
  run(npm,['run','build']);
  // Exclude the legacy downloadable APK from the new APK's embedded web assets.
  const downloads=path.join(root,'build','downloads'); const hold=path.join(root,`.apk-downloads-${Date.now()}`);
  let moved=false;
  try{if(fs.existsSync(downloads)){fs.renameSync(downloads,hold);moved=true;}run(win?'npx.cmd':'npx',['--no-install','cap','sync','android']);}
  finally{if(moved)fs.renameSync(hold,downloads);}
  const android=path.join(root,'android');const jar=path.join(android,'gradle','wrapper','gradle-wrapper.jar');
  if(!fs.existsSync(jar)){
    console.log('Restoring missing Gradle 8.2.1 wrapper from official Gradle sources...');
    const [bytes,sum]=await Promise.all([get('https://raw.githubusercontent.com/gradle/gradle/v8.2.1/gradle/wrapper/gradle-wrapper.jar'),get('https://services.gradle.org/distributions/gradle-8.2.1-wrapper.jar.sha256')]);
    const expected=sum.toString().trim().split(/\s+/)[0].toLowerCase();const actual=crypto.createHash('sha256').update(bytes).digest('hex');
    if(!/^[a-f0-9]{64}$/.test(expected)||actual!==expected)throw new Error('Gradle wrapper checksum verification failed. Nothing installed.');
    fs.writeFileSync(jar,bytes);
  }
  if(!win)fs.chmodSync(path.join(android,'gradlew'),0o755);
  run(win?'gradlew.bat':'./gradlew',['assembleDebug'],{cwd:android});
  const apk=path.join(android,'app','build','outputs','apk','debug','app-debug.apk');
  if(!fs.existsSync(apk))throw new Error('Gradle finished but the expected APK is missing.');
  const out=path.join(root,'..','output');fs.mkdirSync(out,{recursive:true});
  const dest=path.join(out,'NekSathi-updated-debug.apk');fs.copyFileSync(apk,dest);
  console.log(`\nDEBUG APK created: ${dest}\nThis is a local testing APK, not a signed Play Store release.`);
}
main().catch(e=>{console.error(`\nAPK BUILD STOPPED: ${e.message}`);process.exitCode=1;});

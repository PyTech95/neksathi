/* No third-party dependency: validates all assets used by the new public site. */
const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..');
const required = ['src/App.js','src/website/Website.jsx','src/website/website.css','src/website/motion.css','src/website/experience.js','public/website/logo-symbol.png','public/website/motion/neksathi-stories.mp4'];
for(const name of ['hero-road','hero-theft','hero-family','hero-parking','hero-lost','support-family','support-safety','support-travel']) required.push(`public/website/generated/${name}.webp`);
const errors = required.filter(name=>!fs.existsSync(path.join(root,name)) || fs.statSync(path.join(root,name)).size===0);
if(errors.length){console.error('Missing required source/media files:',errors);process.exit(1);}
console.log(`OK: ${required.length} required source/media files exist. This is not a production-build test.`);

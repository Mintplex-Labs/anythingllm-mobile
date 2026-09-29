// Brand fonts (Clash Display) are licensed under the Fontshare FFL, which forbids redistributing the
// font files - so they are gitignored and every dev has to drop them in locally. This runs before the
// dev/build scripts and shouts if they are missing, because the app silently falls back to the system
// font without them. It never fails the command.
//
// Drop the files in src/assets/fonts/ (iOS bundles them from there); the Android copy is synced here.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'src/assets/fonts');
const ANDROID_DIR = path.join(ROOT, 'android/app/src/main/assets/fonts');
const FONTS = ['ClashDisplay-Medium.ttf'];
const DOWNLOAD_URL = 'https://www.fontshare.com/fonts/clash-display';

const missing = [];
for (const font of FONTS) {
  const source = path.join(SOURCE_DIR, font);
  const android = path.join(ANDROID_DIR, font);
  if (!fs.existsSync(source)) {
    missing.push(font);
    continue;
  }
  if (!fs.existsSync(android)) {
    fs.mkdirSync(ANDROID_DIR, { recursive: true });
    fs.copyFileSync(source, android);
    console.log(`[fonts] Copied ${font} into android/app/src/main/assets/fonts`);
  }
}

if (missing.length) {
  const yellow = (s) => `\x1b[1;33m${s}\x1b[0m`;
  const bar = yellow('='.repeat(78));
  console.warn(
    [
      '',
      bar,
      yellow('  WARNING: BRAND FONTS ARE MISSING'),
      bar,
      '',
      `  Missing: ${missing.join(', ')}`,
      '',
      '  These are licensed fonts and are not checked into git. Without them the app',
      '  falls back to the system font (e.g. the empty chat greeting), and iOS builds',
      '  will fail on the missing resource.',
      '',
      `  1. Download Clash Display from ${DOWNLOAD_URL}`,
      '  2. Copy the TTF file(s) above into src/assets/fonts/',
      '  3. Re-run this command (the Android copy is synced automatically)',
      '',
      bar,
      '',
    ].join('\n')
  );
}

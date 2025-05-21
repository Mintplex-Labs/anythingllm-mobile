const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const FONTS_DIR = 'android/app/src/main/assets/fonts';
const OUTPUT_FILE = 'android/link-assets-manifest.json';

function calculateSHA1(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha1');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

function generateManifest() {
  try {
    const files = fs.readdirSync(FONTS_DIR);
    const fontFiles = files.filter(file =>
      file.endsWith('.ttf')
    );

    const manifestData = {
      migIndex: 1,
      data: fontFiles.map(file => {
        const filePath = path.join(FONTS_DIR, file);
        return {
          path: `src/assets/fonts/${file}`,
          sha1: calculateSHA1(filePath)
        };
      })
    };

    fs.writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(manifestData, null, 2)
    );

    console.log(`Manifest generated successfully at ${OUTPUT_FILE}`);
    console.log(`Processed ${fontFiles.length} font files`);

  } catch (error) {
    console.error('Error generating manifest:', error);
  }
}

// Run the script
generateManifest();

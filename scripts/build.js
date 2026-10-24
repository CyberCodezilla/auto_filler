/**
 * FormFlow - Production Build & Packaging Script
 * Generates hardened dist/ folder and release ZIP archives for Chrome Web Store & GitHub Releases.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const releaseDir = path.join(rootDir, 'release');

console.log('====================================================');
console.log('📦 BUILDING FORMFLOW PRODUCTION DISTRIBUTION PACKAGE');
console.log('====================================================\n');

// 1. Read version from package.json or manifest.json
let version = '1.0.0';
const pkgPath = path.join(rootDir, 'package.json');
if (fs.existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.version) version = pkg.version;
  } catch (e) {}
}

console.log(`Target Version: v${version}`);

// 2. Clean and recreate dist/ and release/ directories
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

// 3. Copy Production Assets
const assetsToCopy = [
  { src: 'content', dest: 'content' },
  { src: 'popup', dest: 'popup' },
  { src: 'icons', dest: 'icons' }
];

assetsToCopy.forEach(({ src, dest }) => {
  const srcPath = path.join(rootDir, src);
  const destPath = path.join(distDir, dest);
  if (fs.existsSync(srcPath)) {
    fs.cpSync(srcPath, destPath, { recursive: true });
    console.log(`✔ Copied production asset directory: ${src} -> dist/${dest}`);
  } else {
    console.warn(`⚠ Missing asset directory: ${src}`);
  }
});

// 4. Harden manifest.json for Production
// Strips all development, localhost, and file:// permissions
const rawManifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));

const hardenedManifest = {
  manifest_version: 3,
  name: "FormFlow — Precision Autofill",
  version: version,
  description: rawManifest.description || "Deterministic, zero-hallucination Google Forms autofill engine with fuzzy matching and audit logs.",
  permissions: [
    "activeTab",
    "scripting",
    "storage"
  ],
  host_permissions: [
    "https://docs.google.com/forms/*"
  ],
  action: {
    default_popup: "popup/popup.html",
    default_title: "FormFlow — Precision Autofill",
    default_icon: {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  icons: {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  content_scripts: [
    {
      matches: [
        "https://docs.google.com/forms/*"
      ],
      js: [
        "content/parser.js",
        "content/identity.js",
        "content/matcher.js",
        "content/scraper.js",
        "content/filler.js",
        "content/content.js"
      ],
      css: [
        "content/inject.css"
      ],
      run_at: "document_idle"
    }
  ]
};

fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(hardenedManifest, null, 2));
console.log('✔ Hardened manifest.json (strictly scoped to https://docs.google.com/forms/*)');

// 5. Build ZIP archive using PowerShell Compress-Archive
const zipFileName = `formflow-v${version}.zip`;
const zipFilePath = path.join(releaseDir, zipFileName);
const latestZipFilePath = path.join(releaseDir, 'formflow-latest.zip');

if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
if (fs.existsSync(latestZipFilePath)) fs.unlinkSync(latestZipFilePath);

console.log('\nCompressing dist package into ZIP archive...');

try {
  // Compress dist/* contents
  const psCmd = `powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipFilePath}' -Force"`;
  execSync(psCmd, { stdio: 'inherit' });

  // Copy to formflow-latest.zip
  fs.copyFileSync(zipFilePath, latestZipFilePath);

  // Compute file size & SHA-256
  const zipBuffer = fs.readFileSync(zipFilePath);
  const sizeKb = (zipBuffer.length / 1024).toFixed(2);
  const sha256 = crypto.createHash('sha256').update(zipBuffer).digest('hex');

  console.log('\n🎉 PRODUCTION PACKAGE GENERATED SUCCESSFULLY:');
  console.log(`   Artifact:  ${zipFilePath}`);
  console.log(`   Latest:    ${latestZipFilePath}`);
  console.log(`   Size:      ${sizeKb} KB`);
  console.log(`   SHA-256:   ${sha256}`);
} catch (err) {
  console.error('❌ Error compressing archive:', err.message);
  process.exit(1);
}

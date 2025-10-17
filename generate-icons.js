// Simple script to generate placeholder icons
const fs = require('fs');
const path = require('path');

// SVG template
const generateSVG = (size) => `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#4285f4"/>
  <text x="50%" y="50%" font-family="Arial" font-size="${size * 0.4}" fill="white" text-anchor="middle" dominant-baseline="central">AI</text>
</svg>`;

const sizes = [16, 48, 128];
const extensionDir = path.join(__dirname, 'extension');

console.log('Generating icon files...');

sizes.forEach(size => {
  const svg = generateSVG(size);
  const filename = `icon${size}.svg`;
  const filepath = path.join(extensionDir, filename);

  fs.writeFileSync(filepath, svg);
  console.log(`✓ Created ${filename}`);
});

console.log('\nNote: Edge extensions support SVG icons in Manifest V3.');
console.log('If you need PNG, use an online converter like:');
console.log('  https://cloudconvert.com/svg-to-png');
console.log('\nOr install sharp: npm install sharp');

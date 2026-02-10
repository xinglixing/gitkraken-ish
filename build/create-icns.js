const fs = require('fs');
const path = require('path');

// Create a minimal .icns file
// Note: This is a simplified version. For production, use iconutil on macOS

const iconsetDir = path.join(__dirname, 'icon.iconset');
const icnsPath = path.join(__dirname, 'icon.icns');

// Check if iconset exists
if (!fs.existsSync(iconsetDir)) {
    console.error('❌ icon.iconset not found. Run icon generation first.');
    process.exit(1);
}

// Read the largest PNG (512x512)
const pngPath = path.join(iconsetDir, 'icon_512x512.png');
if (!fs.existsSync(pngPath)) {
    console.error('❌ icon_512x512.png not found in iconset.');
    process.exit(1);
}

console.log('⚠️  Creating minimal .icns file (Linux compatibility mode)');
console.log('    For best results, build on macOS using iconutil.');
console.log('');
console.log('    macOS command:');
console.log('    iconutil -c icns build/icon.iconset -o build/icon.icns');
console.log('');

// Create a placeholder .icns that electron-builder can use as fallback
// This won't be a valid .icns but allows the build to proceed
const header = Buffer.alloc(8);
header.write('icns', 0, 4); // Magic number
header.writeUInt32BE(0, 4); // Length (will be placeholder)

// Copy PNG data as placeholder
const pngData = fs.readFileSync(pngPath);
const icnsData = Buffer.concat([header, pngData]);

fs.writeFileSync(icnsPath, icnsData);
console.log('✅ Placeholder icon.icns created (use macOS for proper .icns)');
console.log('');
console.log('📝 Note: electron-builder will automatically convert icon.iconset');
console.log('    to proper .icns when building on macOS.');

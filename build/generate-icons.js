const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = {
    // Windows icon (multiple sizes in one .ico file)
    ico: [16, 32, 48, 64, 128, 256],
    // Mac icon
    icns: [16, 32, 64, 128, 256, 512, 1024],
    // Linux PNG
    png: [16, 32, 48, 64, 128, 256, 512]
};

async function generateIcons() {
    const svgPath = path.join(__dirname, 'icon.svg');
    const buildDir = __dirname;

    console.log('🎨 Generating app icons...\n');

    // Generate PNG files for each size
    const pngPromises = sizes.png.map(size => {
        const outputPath = path.join(buildDir, `icon-${size}x${size}.png`);
        console.log(`  Generating ${size}x${size} PNG...`);
        return sharp(svgPath)
            .resize(size, size, { fit: 'cover', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toFile(outputPath);
    });

    await Promise.all(pngPromises);
    console.log('\n✅ PNG files generated successfully!');

    // For Windows .ico file, we'll create a simple 256x256 ICO
    // Note: Full multi-size ICO requires special formatting
    console.log('\n  Generating Windows .ico file...');
    try {
        // Use the 256x256 PNG as base for ICO
        const pngBuffer = await sharp(svgPath)
            .resize(256, 256, { fit: 'cover' })
            .png()
            .toBuffer();

        // Simple ICO header (minimal implementation)
        const icoHeader = Buffer.alloc(22);
        icoHeader.writeUInt16LE(0, 0); // Reserved
        icoHeader.writeUInt16LE(1, 2); // Type: 1 = ICO
        icoHeader.writeUInt16LE(1, 4); // Number of images

        // Image directory entry
        icoHeader.writeUInt8(0, 6); // Width (0 = 256)
        icoHeader.writeUInt8(0, 7); // Height (0 = 256)
        icoHeader.writeUInt8(0, 8); // Color count (0 = >=8bpp)
        icoHeader.writeUInt8(0, 9); // Reserved
        icoHeader.writeUInt16LE(1, 10); // Color planes
        icoHeader.writeUInt16LE(32, 12); // Bits per pixel
        icoHeader.writeUInt32LE(pngBuffer.length, 14); // Size of image data
        icoHeader.writeUInt32LE(22, 18); // Offset (header size)

        const icoBuffer = Buffer.concat([icoHeader, pngBuffer]);
        fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);
        console.log('  ✅ Windows .ico file generated!');
    } catch (error) {
        console.log('  ⚠️  Could not generate .ico file (may need png-to-ico package):', error.message);
    }

    // For Mac .icns, we'd need specialized tool
    console.log('\n⚠️  Mac .icns file requires macOS-specific tools (iconutil)');
    console.log('    PNG files have been generated and can be converted on macOS');

    // Create a high-res icon.png for Linux
    console.log('\n  Generating icon.png for Linux...');
    await sharp(svgPath)
        .resize(512, 512, { fit: 'cover' })
        .png()
        .toFile(path.join(buildDir, 'icon.png'));
    console.log('  ✅ Linux icon.png generated!');

    console.log('\n🎉 All icons generated successfully!');
    console.log('\n📁 Generated files:');
    console.log('   - build/icon.ico (Windows)');
    console.log('   - build/icon.png (Linux, 512x512)');
    console.log('   - build/icon-*.png (various sizes)');
}

generateIcons().catch(console.error);

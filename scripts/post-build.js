const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const standaloneRoot = path.join(projectRoot, '.next', 'standalone');

// Find where server.js actually is in the standalone build
function findServerJs(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // Sort entries to prioritize non-node_modules paths if possible, 
    // but better to just skip node_modules entirely for the search
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;

            const found = findServerJs(fullPath);
            if (found) return found;
        } else if (entry.isFile() && entry.name === 'server.js') {
            return path.dirname(fullPath);
        }
    }

    return null;
}

function copyDir(src, dest) {
    if (!fs.existsSync(src)) {
        console.log(`  WARNING: Source directory does not exist: ${src}`);
        return;
    }

    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

console.log('Finding server.js location in standalone build...');
const serverDir = findServerJs(standaloneRoot);

if (!serverDir) {
    console.error('ERROR: Could not find server.js in standalone build!');
    process.exit(1);
}

console.log(`Found server.js at: ${serverDir}`);

// Copy public and static relative to server.js location
const srcPublic = path.join(projectRoot, 'public');
const destPublic = path.join(serverDir, 'public');

const srcStatic = path.join(projectRoot, '.next', 'static');
const destStatic = path.join(serverDir, '.next', 'static');

console.log('Copying public folder to standalone...');
copyDir(srcPublic, destPublic);

console.log('Copying .next/static folder to standalone...');
copyDir(srcStatic, destStatic);

// Verify chunks were copied
const chunksPath = path.join(destStatic, 'chunks');
if (fs.existsSync(chunksPath)) {
    const chunkFiles = fs.readdirSync(chunksPath);
    console.log(`  ✓ Copied ${chunkFiles.length} chunk files to ${chunksPath}`);
} else {
    console.log('  WARNING: No chunks directory found in static folder');
}

console.log('Post-build asset copy complete.');

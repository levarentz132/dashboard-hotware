const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const projectDataDir = path.join(projectRoot, 'data');
const backupDir = path.join(projectRoot, 'data_backup');

// Ensure root data directory exists
if (!fs.existsSync(projectDataDir)) {
    fs.mkdirSync(projectDataDir, { recursive: true });
}

// 1. Create a timestamped/safe local backup of data/ before build
try {
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    const dataFiles = fs.readdirSync(projectDataDir);
    for (const f of dataFiles) {
        const src = path.join(projectDataDir, f);
        const stat = fs.statSync(src);
        if (stat.isFile()) {
            fs.copyFileSync(src, path.join(backupDir, f));
        }
    }
    console.log('✓ Preserved local data backup in data_backup/');
} catch (e) {
    console.warn('Could not create backup:', e.message);
}

// 2. Check if .next/standalone has newer data from previous runtime and sync it back to root
const standaloneRoot = path.join(projectRoot, '.next', 'standalone');
function syncStandaloneData(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'redis' || entry.name === 'dist') continue;
            if (entry.name === 'data') {
                // Found standalone data folder, sync newer files back to projectRoot/data
                console.log(`Found standalone data folder at ${fullPath}, syncing to root data/...`);
                syncDir(fullPath, projectDataDir);
            } else {
                syncStandaloneData(fullPath);
            }
        }
    }
}

function syncDir(src, dest) {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            syncDir(srcPath, destPath);
        } else {
            // Only copy if destination doesn't exist or source is newer/larger
            let shouldCopy = !fs.existsSync(destPath);
            if (!shouldCopy) {
                const srcStat = fs.statSync(srcPath);
                const destStat = fs.statSync(destPath);
                if (srcStat.mtimeMs > destStat.mtimeMs || srcStat.size > destStat.size) {
                    shouldCopy = true;
                }
            }
            if (shouldCopy) {
                fs.copyFileSync(srcPath, destPath);
                console.log(`  ✓ Synced back: ${entry.name}`);
            }
        }
    }
}

try {
    syncStandaloneData(standaloneRoot);
} catch (e) {
    console.warn('Could not sync standalone data:', e.message);
}
console.log('Pre-build data preservation complete.');
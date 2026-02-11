const fs = require('fs');
const path = require('path');

const srcPublic = path.join(__dirname, '..', 'public');
const destPublic = path.join(__dirname, '..', '.next', 'standalone', 'public');

const srcStatic = path.join(__dirname, '..', '.next', 'static');
const destStatic = path.join(__dirname, '..', '.next', 'standalone', '.next', 'static');

function copyDir(src, dest) {
    if (!fs.existsSync(src)) return;

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

console.log('Copying public folder to standalone...');
copyDir(srcPublic, destPublic);

console.log('Copying .next/static folder to standalone...');
copyDir(srcStatic, destStatic);

console.log('Post-build asset copy complete.');

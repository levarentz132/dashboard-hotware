const fs = require('fs');
const path = require('path');

const dirs = ['dist', '.next', 'data'];

dirs.forEach(dir => {
    const fullPath = path.join(__dirname, '..', dir);

    if (fs.existsSync(fullPath)) {
        console.log(`Cleaning ${dir}...`);
        try {
            fs.rmSync(fullPath, { recursive: true, force: true });
            console.log(`  ✓ ${dir} cleaned.`);
        } catch (e) {
            console.warn(`    Could not clean ${dir}: ${e.message}`);
            console.warn(`    Proceeding anyway...`);
        }
    }
});
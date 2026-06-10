import fs from 'fs';
import path from 'path';

function findDuplicateExports(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            findDuplicateExports(fullPath);
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            const exports = {};
            lines.forEach((line, index) => {
                const match = line.match(/export const (\w+)/);
                if (match) {
                    const name = match[1];
                    if (exports[name]) {
                        console.log(`Duplicate export "${name}" in ${fullPath} at lines ${exports[name].line + 1} and ${index + 1}`);
                    }
                    exports[name] = { line: index };
                }
            });
        }
    }
}

findDuplicateExports('k:/Project/KANAKU/frontend/src/app/components');

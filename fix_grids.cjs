const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'mobile/src/pages');
const files = fs.readdirSync(dir);

for (const file of files) {
    if (!file.endsWith('.tsx')) continue;
    let content = fs.readFileSync(path.join(dir, file), 'utf-8');

    // Replace grid-cols-2 to grid-cols-6 with grid-cols-1 sm:grid-cols-X
    // only if it doesn't already have a sm: or md: or lg: or xl: or 2xl: prefix
    content = content.replace(/(?<![a-z2]:)grid-cols-([2-6])/g, 'grid-cols-1 sm:grid-cols-$1');

    fs.writeFileSync(path.join(dir, file), content);
    console.log(`Fixed grids in ${file}`);
}

const fs = require('fs');

let oldSales = fs.readFileSync('old_sales.tsx', 'utf-8');
let newSales = fs.readFileSync('mobile/src/pages/SalesPage.tsx', 'utf-8');

// Extract the map block from old_sales.tsx
const startIndex = oldSales.indexOf('{filteredSales.map((sale, index) => {');
const endIndex = oldSales.indexOf('</div>\n                        )}', startIndex);
const oldBlock = oldSales.slice(startIndex, endIndex);

// Extract the map block from newSales
const startIndexNew = newSales.indexOf('{filteredSales.map((sale, index) => {');
const endIndexNew = newSales.indexOf('</div>\n                        )}', startIndexNew);

if (startIndex !== -1 && endIndex !== -1 && startIndexNew !== -1 && endIndexNew !== -1) {
    newSales = newSales.slice(0, startIndexNew) + oldBlock + newSales.slice(endIndexNew);
    fs.writeFileSync('mobile/src/pages/SalesPage.tsx', newSales);
    console.log('Replaced SalesPage.tsx list with old mobile list layout!');
} else {
    console.log('Could not find blocks');
}

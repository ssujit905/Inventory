const fs = require('fs');

let content = fs.readFileSync('mobile/src/pages/WebsiteProductsPage.tsx', 'utf-8');

// The desktop card starts with:
// <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-all group">
//     <div className="relative aspect-square bg-gray-50 dark:bg-gray-800">
// We replace the outer div and the image div to use flex and w-32 for mobile:

content = content.replace(
    /<div key=\{p\.id\} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-all group">[\s\S]*?<div className="relative aspect-square bg-gray-50 dark:bg-gray-800">/m,
    `<div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm flex flex-col sm:flex-row group">
                                    <div className="w-full sm:w-40 aspect-video sm:aspect-square bg-gray-50 dark:bg-gray-800 relative flex-shrink-0">`
);

content = content.replace(
    /<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">/m,
    `<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`
);

fs.writeFileSync('mobile/src/pages/WebsiteProductsPage.tsx', content);
console.log('Fixed WebsiteProductsPage UI');

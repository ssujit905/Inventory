const fs = require('fs');
const path = require('path');

const desktopDir = path.join(__dirname, 'desktop/src/pages');
const mobileDir = path.join(__dirname, 'mobile/src/pages');

// Backup the original mobile SalesPage.tsx
const originalMobileSales = fs.readFileSync(path.join(mobileDir, 'SalesPage.tsx'), 'utf-8');

// Extract handleConfirmExport from original mobile SalesPage
const startTag = 'const handleConfirmExport = async () => {';
const startIndex = originalMobileSales.indexOf(startTag);
// Find the closing brace of handleConfirmExport
let openBraces = 0;
let endIndex = -1;
for (let i = startIndex; i < originalMobileSales.length; i++) {
    if (originalMobileSales[i] === '{') openBraces++;
    if (originalMobileSales[i] === '}') {
        openBraces--;
        if (openBraces === 0) {
            endIndex = i;
            break;
        }
    }
}
const mobileExportLogic = originalMobileSales.substring(startIndex, endIndex + 1);

// Extract capacitor imports from original mobile SalesPage
const capacitorImports = `import { Capacitor, registerPlugin } from '@capacitor/core';
const FileExport = registerPlugin<{
    saveBase64ToDownloads(options: { fileName: string; base64: string }): Promise<{ ok: boolean; uri?: string }>;
}>('FileExport');
`;

const files = fs.readdirSync(desktopDir);

for (const file of files) {
    if (!file.endsWith('.tsx')) continue;
    let content = fs.readFileSync(path.join(desktopDir, file), 'utf-8');

    // Replace DollarSign with IndianRupee
    content = content.replace(/DollarSign/g, 'IndianRupee');

    if (file === 'SalesPage.tsx') {
        // Inject capacitor imports right after the first import block
        content = content.replace(/(import.*?\n)(import.*?\n)/, `$1${capacitorImports}$2`);

        // Replace desktop handleConfirmExport with mobile one
        const desktopStartIndex = content.indexOf(startTag);
        let dOpenBraces = 0;
        let dEndIndex = -1;
        for (let i = desktopStartIndex; i < content.length; i++) {
            if (content[i] === '{') dOpenBraces++;
            if (content[i] === '}') {
                dOpenBraces--;
                if (dOpenBraces === 0) {
                    dEndIndex = i;
                    break;
                }
            }
        }
        
        if (desktopStartIndex !== -1 && dEndIndex !== -1) {
            content = content.substring(0, desktopStartIndex) + mobileExportLogic + content.substring(dEndIndex + 1);
        } else {
            console.log('Failed to replace handleConfirmExport in SalesPage.tsx');
        }
    }

    fs.writeFileSync(path.join(mobileDir, file), content);
    console.log(`Synced ${file} to mobile.`);
}

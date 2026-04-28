const fs = require('fs');

let backup = fs.readFileSync('mobile/src/pages_backup/ProfitPage.tsx', 'utf-8');
let current = fs.readFileSync('mobile/src/pages/ProfitPage.tsx', 'utf-8');

const calculateMatch = backup.match(/const calculateProfit = \(\) => \{[\s\S]*?setSaleWiseProfit\(Array\.from\(saleGroups\.values\(\)\)\);[\s\S]*?\};/);
if (calculateMatch) {
    current = current.replace(/const calculateProfit = \(\) => \{[\s\S]*?setSaleWiseProfit\(Array\.from\(saleGroups\.values\(\)\)\);[\s\S]*?\};/, calculateMatch[0]);
    fs.writeFileSync('mobile/src/pages/ProfitPage.tsx', current);
    console.log("Profit math updated!");
} else {
    console.log("Could not find math in backup");
}

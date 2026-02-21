const fs = require('fs');
const path = require('path');

const messagesPath = path.join(__dirname, "this_profile's_activity_across_facebook/messages");

function normalize(text) {
    if (!text) return "";
    return text.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

function analyze() {
    const foldersToScan = ['inbox', 'filtered_threads', 'archived_threads'];
    let totalThreadsScanned = 0;
    let totalFilesScanned = 0;
    const qaPairs = [];

    foldersToScan.forEach(folder => {
        const folderPath = path.join(messagesPath, folder);
        if (!fs.existsSync(folderPath)) return;

        const threads = fs.readdirSync(folderPath);
        threads.forEach(thread => {
            const threadPath = path.join(folderPath, thread);
            if (!fs.statSync(threadPath).isDirectory()) return;

            totalThreadsScanned++;
            const files = fs.readdirSync(threadPath).filter(f => f.startsWith('message_') && f.endsWith('.json'));

            files.forEach(file => {
                totalFilesScanned++;
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(threadPath, file), 'utf8'));
                    const messages = data.messages || [];
                    const chrono = [...messages].reverse();

                    for (let i = 0; i < chrono.length - 1; i++) {
                        const current = chrono[i];
                        const next = chrono[i + 1];

                        if (current.sender_name !== "Ktm Gadget" && next.sender_name === "Ktm Gadget") {
                            qaPairs.push({
                                q: current.content,
                                a: next.content
                            });
                        }
                    }
                } catch (e) { }
            });
        });
    });

    console.log(`--- Scan Summary ---`);
    console.log(`Total Threads Scanned: ${totalThreadsScanned}`);
    console.log(`Total JSON Files Read: ${totalFilesScanned}`);
    console.log(`Total Q&A Pairs Found: ${qaPairs.length}`);

    const frequentQs = {};
    qaPairs.forEach(pair => {
        const normQ = normalize(pair.q);
        if (!normQ) return;
        if (!frequentQs[normQ]) {
            frequentQs[normQ] = { count: 0, responses: {} };
        }
        frequentQs[normQ].count++;
        if (pair.a) {
            frequentQs[normQ].responses[pair.a] = (frequentQs[normQ].responses[pair.a] || 0) + 1;
        }
    });

    const sorted = Object.entries(frequentQs)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 50);

    console.log("\n--- Top 50 Common Questions and Page Responses ---");
    sorted.forEach(([q, data]) => {
        const responseEntries = Object.entries(data.responses);
        if (responseEntries.length === 0) return;
        const bestResponse = responseEntries.sort((a, b) => b[1] - a[1])[0][0];
        console.log(`Q: "${q}" (${data.count} times)`);
        console.log(`Suggested A: "${bestResponse}"`);
        console.log("-------------------");
    });
}

analyze();

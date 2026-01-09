/**
 * Fetch packages from React Native Directory
 * 
 * Filters:
 * - Android + iOS support
 * - Expo Go compatible (works without custom native code)
 * - NOT unmaintained
 * - NOT dev tools
 */

const https = require('https');
const fs = require('fs');

const BASE_URL = 'https://reactnative.directory/api/libraries';
const LIMIT = 100;

function fetch(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function fetchAllPages() {
    const allLibs = [];
    let offset = 0;
    let total = 0;

    console.log('Fetching from React Native Directory...');
    console.log('Filters: android=true, ios=true, expoGo=true, isMaintained=true\n');

    while (true) {
        // Filter: Android + iOS + Expo Go compatible + Maintained
        const url = `${BASE_URL}?android=true&ios=true&expoGo=true&isMaintained=true&offset=${offset}&limit=${LIMIT}`;
        console.log(`Page ${Math.floor(offset / LIMIT) + 1}... (offset=${offset})`);

        const result = await fetch(url);

        if (offset === 0) {
            total = result.total;
            console.log(`Total matching: ${total}\n`);
        }

        if (!result.libraries || result.libraries.length === 0) break;

        allLibs.push(...result.libraries);
        offset += LIMIT;

        if (offset >= total) break;

        await new Promise(r => setTimeout(r, 200));
    }

    return { libraries: allLibs, total };
}

async function main() {
    const { libraries, total } = await fetchAllPages();

    console.log(`\nFetched: ${libraries.length} / ${total}`);

    // Filter out dev tools
    const filtered = libraries.filter(lib => !lib.dev);
    console.log(`After removing dev tools: ${filtered.length}`);

    // Extract package info
    const packages = filtered
        .filter(lib => lib.npmPkg)
        .map(lib => ({
            name: lib.npmPkg,
            downloads: lib.npm?.weekDownloads || 0,
            size: lib.npm?.size || 0,
            hasNativeCode: lib.github?.hasNativeCode || false,
            expoGo: lib.expoGo || false,
        }))
        .sort((a, b) => b.downloads - a.downloads);

    // Calculate total size
    const totalSizeBytes = packages.reduce((sum, p) => sum + p.size, 0);
    const totalSizeMB = (totalSizeBytes / 1024 / 1024).toFixed(2);

    // Save
    if (!fs.existsSync('./data')) fs.mkdirSync('./data');
    fs.writeFileSync('./data/packages.json', JSON.stringify(packages.map(p => p.name), null, 2));
    fs.writeFileSync('./data/packages-full.json', JSON.stringify(packages, null, 2));

    console.log(`\n✅ Saved: ${packages.length} packages`);
    console.log(`   - ./data/packages.json`);
    console.log(`   - ./data/packages-full.json`);

    // Stats
    const jsOnly = packages.filter(p => !p.hasNativeCode);

    console.log(`\n📊 Stats:`);
    console.log(`   Total packages: ${packages.length}`);
    console.log(`   JS-only (no native): ${jsOnly.length}`);
    console.log(`   All work with Expo Go: ${packages.length} (100%)`);

    console.log(`\n📦 Size Estimate:`);
    console.log(`   Total npm unpacked: ${totalSizeMB} MB`);
    console.log(`   After bundling (~30%): ~${(totalSizeBytes * 0.3 / 1024 / 1024).toFixed(0)} MB`);

    console.log(`\nTop 10 by downloads:`);
    packages.slice(0, 10).forEach((p, i) => {
        console.log(`   ${String(i + 1).padStart(2)}. ${p.name.padEnd(35)} ${(p.downloads / 1000000).toFixed(1)}M/week`);
    });
}

main().catch(console.error);

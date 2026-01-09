/**
 * Snackager Bundler - FAST with esbuild
 * 
 * Features:
 * - 10x faster than webpack (uses esbuild)
 * - Skips packages that are already bundled with same version
 * - Only bundles new versions
 * - Saves complete index with package IDs for version tracking
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const esbuild = require('esbuild');
const { Client, Storage, ID } = require('node-appwrite');
const { InputFile } = require('node-appwrite/file');

// ============ CONFIG ============
const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const APPWRITE_PROJECT = process.env.APPWRITE_PROJECT;
const APPWRITE_KEY = process.env.APPWRITE_API_KEY;
const BUCKET_ID = process.env.APPWRITE_BUCKET_ID;

// ============ APPWRITE CLIENT ============
const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT)
    .setKey(APPWRITE_KEY);
const storage = new Storage(client);

// ============ INDEX ============
// Structure: { "package@version": { name, version, fileId, url, size, uploadedAt }, "package": { latest pointer } }
let index = {};
const INDEX_FILE = './data/index.json';

// ============ SKIP PACKAGES (Built into Expo Go) ============
const SKIP_PACKAGES = new Set([
    // Core
    'react', 'react-dom', 'react-native', 'expo', 'expo-modules-core',
    // Expo SDK
    'expo-asset', 'expo-av', 'expo-barcode-scanner', 'expo-battery',
    'expo-blur', 'expo-brightness', 'expo-build-properties', 'expo-calendar',
    'expo-camera', 'expo-cellular', 'expo-clipboard', 'expo-constants',
    'expo-contacts', 'expo-crypto', 'expo-dev-client', 'expo-device',
    'expo-document-picker', 'expo-file-system', 'expo-font', 'expo-gl',
    'expo-haptics', 'expo-image', 'expo-image-manipulator', 'expo-image-picker',
    'expo-intent-launcher', 'expo-keep-awake', 'expo-linear-gradient',
    'expo-linking', 'expo-local-authentication', 'expo-localization',
    'expo-location', 'expo-mail-composer', 'expo-manifests', 'expo-media-library',
    'expo-network', 'expo-notifications', 'expo-print', 'expo-router',
    'expo-screen-capture', 'expo-screen-orientation', 'expo-secure-store',
    'expo-sensors', 'expo-sharing', 'expo-sms', 'expo-speech',
    'expo-splash-screen', 'expo-sqlite', 'expo-status-bar', 'expo-store-review',
    'expo-structured-headers', 'expo-system-ui', 'expo-task-manager',
    'expo-tracking-transparency', 'expo-updates', 'expo-video-thumbnails',
    'expo-web-browser', 'expo-auth-session', 'expo-json-utils', 'expo-application',
    '@expo/vector-icons', '@expo/react-native-action-sheet',
    // React Navigation
    '@react-navigation/native', '@react-navigation/elements',
    '@react-navigation/stack', '@react-navigation/bottom-tabs',
    '@react-navigation/drawer', '@react-navigation/material-top-tabs',
    '@react-navigation/native-stack', '@react-navigation/routers',
    // Native packages
    'react-native-safe-area-context', 'react-native-screens',
    'react-native-gesture-handler', 'react-native-reanimated',
    'react-native-svg', 'react-native-webview', 'react-native-maps',
    'react-native-view-shot', 'react-native-pager-view',
    '@react-native-async-storage/async-storage',
    '@react-native-community/netinfo', '@react-native-community/datetimepicker',
    '@react-native-community/slider', '@react-native-picker/picker',
    '@react-native-segmented-control/segmented-control',
    '@react-native-masked-view/masked-view',
    'react-native-svg-transformer', 'lottie-react-native',
    'react-native-blob-util', 'react-native-fs', 'react-native-pdf',
    '@sentry/react-native', '@stripe/stripe-react-native',
    '@gorhom/bottom-sheet', 'react-native-tab-view', 'react-freeze',
    '@shopify/flash-list', 'react-native-drawer-layout',
    'react-native-reanimated-carousel', 'moti',
]);

function isBuiltIn(pkg) {
    return SKIP_PACKAGES.has(pkg);
}

function loadIndex() {
    if (fs.existsSync(INDEX_FILE)) {
        try {
            index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
            console.log(`📋 Loaded ${Object.keys(index).length} entries from index`);
        } catch {
            index = {};
        }
    }
}

function saveIndex() {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

// ============ VERSION CHECK ============

/**
 * Check if this exact version is already bundled
 */
function isVersionBundled(pkg, version) {
    const key = `${pkg}@${version}`;
    return index[key] !== undefined && index[key].fileId;
}

/**
 * Get latest npm version of package
 */
function getLatestVersion(pkg) {
    try {
        return execSync(`npm view ${pkg} version`, {
            encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], shell: true
        }).trim();
    } catch {
        return null;
    }
}

function getFileName(pkg, version) {
    const safeName = pkg.replace(/[@/]/g, '-').replace(/^-/, '');
    return `${safeName}@${version}.js`;
}

// ============ BUNDLE WITH ESBUILD ============

async function bundlePackage(pkg) {
    const startTime = Date.now();

    // Skip built-in packages
    if (isBuiltIn(pkg)) {
        console.log(`  ⏭️  Skip: built into Expo Go`);
        return { success: true, skipped: true, reason: 'builtin' };
    }

    // Get latest version from npm
    const version = getLatestVersion(pkg);
    if (!version) {
        console.log(`  ❌ Could not get version`);
        return { success: false, error: 'Could not get version' };
    }

    // Check if this version is already bundled
    if (isVersionBundled(pkg, version)) {
        console.log(`  ⏭️  Skip: ${version} already bundled`);
        return { success: true, skipped: true, reason: 'version_exists', version };
    }

    const fileName = getFileName(pkg, version);
    const safeName = pkg.replace(/[@/]/g, '-');
    const tmpDir = path.resolve(`./temp/${safeName}`);

    try {
        fs.mkdirSync(tmpDir, { recursive: true });

        // Install package
        console.log(`  📦 Installing ${version}...`);
        execSync(`npm init -y && npm install ${pkg}@${version}`, {
            cwd: tmpDir, stdio: 'pipe', shell: true, timeout: 120000,
        });

        // Find entry point
        let entryPath = path.join(tmpDir, 'node_modules', pkg);
        try {
            const pkgJson = JSON.parse(fs.readFileSync(path.join(entryPath, 'package.json'), 'utf8'));
            const main = pkgJson.module || pkgJson.main || 'index.js';
            if (fs.existsSync(path.join(entryPath, main))) {
                entryPath = path.join(entryPath, main);
            }
        } catch { }

        // Bundle with esbuild
        console.log(`  ⚡ Bundling...`);
        const bundlePath = path.join(tmpDir, 'bundle.js');

        await esbuild.build({
            entryPoints: [entryPath],
            bundle: true,
            outfile: bundlePath,
            format: 'iife',
            globalName: '__snack_exports',
            platform: 'browser',
            target: 'es2020',
            minify: true,
            external: ['react', 'react-native', 'react-dom', 'expo', 'expo-*', '@expo/*', '@react-navigation/*'],
            logLevel: 'silent',
        });

        if (!fs.existsSync(bundlePath)) {
            throw new Error('Bundle not created');
        }

        const bundleSize = fs.statSync(bundlePath).size;

        // Upload to Appwrite
        console.log(`  ☁️  Uploading...`);
        const fileId = ID.unique();
        await storage.createFile(BUCKET_ID, fileId, InputFile.fromPath(bundlePath, fileName));

        const url = `${APPWRITE_ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${fileId}/view?project=${APPWRITE_PROJECT}`;

        // Update index with full details
        const key = `${pkg}@${version}`;
        const entry = {
            name: pkg,
            version,
            fileId,
            fileName,
            url,
            size: bundleSize,
            uploadedAt: new Date().toISOString(),
        };

        // Save versioned entry
        index[key] = entry;

        // Update latest pointer
        index[pkg] = {
            ...entry,
            latestVersion: version,
        };

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  ✅ ${version} - ${(bundleSize / 1024).toFixed(1)}KB in ${elapsed}s`);
        return { success: true, version, size: bundleSize, time: elapsed };

    } catch (error) {
        console.log(`  ❌ ${error.message.slice(0, 60)}`);
        return { success: false, error: error.message, version };

    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
    }
}

// ============ MAIN ============

async function main() {
    console.log('\n⚡ Snackager Bundler - Fast with esbuild\n');
    console.log('📅 Only bundles NEW versions (skips existing)\n');

    if (!APPWRITE_PROJECT || !APPWRITE_KEY || !BUCKET_ID) {
        console.error('❌ Missing Appwrite credentials in .env');
        process.exit(1);
    }

    const packagesFile = './data/packages.json';
    if (!fs.existsSync(packagesFile)) {
        console.error('❌ Run `npm run fetch` first!');
        process.exit(1);
    }

    const packages = JSON.parse(fs.readFileSync(packagesFile, 'utf8'));
    console.log(`📦 Packages to check: ${packages.length}\n`);

    // Load existing index (to check what's already bundled)
    loadIndex();

    const stats = {
        bundled: 0,
        skippedBuiltin: 0,
        skippedExists: 0,
        failed: 0,
        totalSize: 0
    };
    const failed = [];
    const startTime = Date.now();

    for (let i = 0; i < packages.length; i++) {
        const pkg = packages[i];
        console.log(`[${i + 1}/${packages.length}] ${pkg}`);

        const result = await bundlePackage(pkg);

        if (result.success) {
            if (result.skipped) {
                if (result.reason === 'builtin') stats.skippedBuiltin++;
                else stats.skippedExists++;
            } else {
                stats.bundled++;
                stats.totalSize += result.size || 0;
            }
        } else {
            stats.failed++;
            failed.push({ name: pkg, version: result.version, error: result.error });
        }

        // Save every 25 packages
        if (i > 0 && i % 25 === 0) {
            saveIndex();
            console.log(`\n💾 Index saved (${i}/${packages.length})\n`);
        }
    }

    // Final save
    saveIndex();

    // Upload index to Appwrite (with fixed ID for easy retrieval)
    try {
        console.log('\n☁️  Uploading index.json...');
        // Try to delete old index first
        try { await storage.deleteFile(BUCKET_ID, 'index'); } catch { }
        await storage.createFile(BUCKET_ID, 'index', InputFile.fromPath(INDEX_FILE, 'index.json'));
    } catch (e) {
        console.log(`  ⚠️  Could not upload index: ${e.message}`);
    }

    const totalElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log(`\n${'='.repeat(50)}`);
    console.log('COMPLETE');
    console.log('='.repeat(50));
    console.log(`✅ New bundles: ${stats.bundled}`);
    console.log(`⏭️  Skipped (built-in): ${stats.skippedBuiltin}`);
    console.log(`⏭️  Skipped (version exists): ${stats.skippedExists}`);
    console.log(`❌ Failed: ${stats.failed}`);
    console.log(`📦 New data: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`⏱️  Time: ${totalElapsed} minutes`);
    console.log(`📋 Total in index: ${Object.keys(index).length} entries`);

    if (failed.length > 0) {
        fs.writeFileSync('./data/failed.json', JSON.stringify(failed, null, 2));
        console.log(`\n❌ Failed packages saved to ./data/failed.json`);
    }
}

main().catch(console.error);

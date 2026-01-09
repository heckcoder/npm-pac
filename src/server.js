/**
 * Snackager API Server
 * 
 * Serves bundled packages with version support
 * Endpoints: /bundle/:package, /bundle/:package@:version
 */

require('dotenv').config();
const express = require('express');
const fs = require('fs');

const app = express();
app.use(express.json());

// ============ INDEX ============
let index = {};
const INDEX_FILE = './data/index.json';

function loadIndex() {
    if (fs.existsSync(INDEX_FILE)) {
        index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
        console.log(`Loaded ${Object.keys(index).length} entries`);
    }
}

// ============ CORS ============
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ============ ENDPOINTS ============

/**
 * GET /bundle/:package
 * GET /bundle/:package@:version
 * 
 * Returns package info with download URL
 */
app.get('/bundle/:pkg(*)', (req, res) => {
    let pkg = req.params.pkg;
    let version = null;

    // Parse package@version
    if (pkg.includes('@') && !pkg.startsWith('@')) {
        // non-scoped: axios@1.0.0
        const parts = pkg.split('@');
        pkg = parts[0];
        version = parts[1];
    } else if (pkg.match(/@[^/]+\/[^@]+@/)) {
        // scoped: @scope/pkg@1.0.0
        const match = pkg.match(/^(@[^/]+\/[^@]+)@(.+)$/);
        if (match) {
            pkg = match[1];
            version = match[2];
        }
    }

    // Look up
    const key = version ? `${pkg}@${version}` : pkg;
    const entry = index[key];

    if (entry) {
        res.json({
            name: entry.name,
            version: entry.version,
            url: entry.url,
            fileId: entry.fileId,
            fileName: entry.fileName,
            size: entry.size,
            cached: true,
        });
    } else {
        res.status(404).json({
            name: pkg,
            version: version,
            cached: false,
            error: 'Package not found',
        });
    }
});

/**
 * POST /bundle/batch
 * 
 * Lookup multiple packages
 * Body: { packages: ["axios", "lodash@4.17.0"] }
 */
app.post('/bundle/batch', (req, res) => {
    const { packages } = req.body;

    if (!Array.isArray(packages)) {
        return res.status(400).json({ error: 'packages must be array' });
    }

    const results = {};

    for (const pkgQuery of packages) {
        const entry = index[pkgQuery];
        if (entry) {
            results[pkgQuery] = {
                name: entry.name,
                version: entry.version,
                url: entry.url,
                cached: true,
            };
        } else {
            results[pkgQuery] = { cached: false };
        }
    }

    res.json({ packages: results });
});

/**
 * GET /versions/:package
 * 
 * List all cached versions of a package
 */
app.get('/versions/:pkg(*)', (req, res) => {
    const pkg = req.params.pkg;
    const versions = [];

    for (const [key, value] of Object.entries(index)) {
        if (value.name === pkg && key.includes('@')) {
            versions.push({
                version: value.version,
                url: value.url,
                size: value.size,
                uploadedAt: value.uploadedAt,
            });
        }
    }

    res.json({
        name: pkg,
        versions: versions.sort((a, b) => b.uploadedAt?.localeCompare(a.uploadedAt)),
        count: versions.length,
    });
});

/**
 * GET /stats
 */
app.get('/stats', (req, res) => {
    const packages = new Set();
    let totalSize = 0;
    let versionCount = 0;

    for (const [key, value] of Object.entries(index)) {
        if (key.includes('@') && value.name) {
            packages.add(value.name);
            totalSize += value.size || 0;
            versionCount++;
        }
    }

    res.json({
        uniquePackages: packages.size,
        totalVersions: versionCount,
        totalSize: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
    });
});

/**
 * POST /reload
 * Reload index from file
 */
app.post('/reload', (req, res) => {
    loadIndex();
    res.json({
        success: true,
        entries: Object.keys(index).length,
    });
});

/**
 * GET /health
 */
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ============ START ============
loadIndex();

const PORT = process.env.PORT || 3012;
app.listen(PORT, () => {
    console.log(`\n🚀 Snackager API: http://localhost:${PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  /bundle/:package         - Get latest version`);
    console.log(`  GET  /bundle/:package@:ver    - Get specific version`);
    console.log(`  POST /bundle/batch            - Get multiple packages`);
    console.log(`  GET  /versions/:package       - List all versions`);
    console.log(`  GET  /stats                   - Cache statistics`);
    console.log(`  POST /reload                  - Reload index`);
});

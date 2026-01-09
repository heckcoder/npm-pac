# Snackager - Camber Cloud

Pre-bundle React Native packages for your AI app builder.

## 🚀 Quick Start (Camber Cloud / Jupyter)

### 1. Setup Environment

```bash
# Clone/upload this folder to Camber Cloud
cd snackager

# Install dependencies
npm install

# Copy and edit .env
cp .env.example .env
```

### 2. Configure Appwrite

Edit `.env`:
```env
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT=your-project-id
APPWRITE_API_KEY=your-api-key
APPWRITE_BUCKET_ID=snackager-bundles
```

### 3. Fetch Packages

```bash
npm run fetch
```

Output: `data/packages.json` with 1,945 packages

### 4. Bundle All Packages

```bash
npm run bundle
```

This will:
- Bundle each package with Webpack
- Upload to Appwrite Storage as `{package}@{version}.js`
- Skip existing versions (no duplicates)
- Save `index.json` with all package URLs

### 5. Start API Server

```bash
npm start
```

## 📡 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /bundle/:pkg` | Get latest version |
| `GET /bundle/:pkg@:version` | Get specific version |
| `POST /bundle/batch` | Get multiple packages |
| `GET /versions/:pkg` | List all versions |
| `GET /stats` | Cache statistics |

### Examples

```bash
# Get latest axios
curl http://localhost:3012/bundle/axios

# Get specific version
curl http://localhost:3012/bundle/axios@1.6.0

# Get multiple
curl -X POST http://localhost:3012/bundle/batch \
  -H "Content-Type: application/json" \
  -d '{"packages": ["axios", "lodash"]}'
```

## 📁 File Structure

```
snackager/
├── package.json
├── .env
├── src/
│   ├── fetch-packages.js  # Fetch from React Native Directory
│   ├── bundler.js         # Bundle & upload to Appwrite
│   └── server.js          # API server
└── data/
    ├── packages.json      # Package list
    ├── packages-full.json # With metadata
    └── index.json         # Bundle URLs
```

## 📦 Bundle Naming

```
{package-name}@{version}.js

Examples:
  axios@1.6.0.js
  lodash@4.17.21.js
  react-navigation-native@7.1.0.js
```

## ⚡ Appwrite Storage

Each bundle is stored in Appwrite with:
- **Unique file ID** per version
- **File name**: `{pkg}@{version}.js`
- **No duplicates**: Skips if version exists

## 💰 Cost

| Component | Cost |
|-----------|------|
| Camber Cloud | Usage-based |
| Appwrite Pro | $15/month (included storage) |
| **Bandwidth** | Free via Appwrite |

## 🔄 Re-running

When you run `npm run bundle` again:
- ✅ Skips packages already bundled
- ✅ Only bundles new versions
- ✅ Updates index.json

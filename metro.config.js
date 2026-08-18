const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Needed for expo-sqlite (web), which imports `wa-sqlite.wasm`.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// Allow bundling `.onnx` model files as assets (ONNX Runtime, Phase 1+).
if (!config.resolver.assetExts.includes('onnx')) {
  config.resolver.assetExts.push('onnx');
}

// Exclude the standalone trainer-proxy Worker project (Phase 7) from Metro's file watching /
// haste map — it has its own node_modules and must never be bundled into the app.
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList)
    ? existingBlockList
    : existingBlockList
      ? [existingBlockList]
      : []),
  /[\\/]server[\\/]trainer-proxy[\\/].*/,
];

// Add COEP and COOP headers to support SharedArrayBuffer for expo-sqlite on web
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    middleware(req, res, next);
  };
};

module.exports = config;


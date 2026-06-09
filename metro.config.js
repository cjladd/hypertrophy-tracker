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

// Add COEP and COOP headers to support SharedArrayBuffer for expo-sqlite on web
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    middleware(req, res, next);
  };
};

module.exports = config;


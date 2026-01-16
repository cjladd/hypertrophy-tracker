const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Needed for expo-sqlite (web), which imports `wa-sqlite.wasm`.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

module.exports = config;


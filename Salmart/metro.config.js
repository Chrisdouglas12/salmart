const { getDefaultConfig } = require("expo/metro-config");
const exclusionList = require("metro-config/src/defaults/exclusionList");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Only watch your project root
config.watchFolders = [__dirname];

// Ignore ALL node_modules deeply (fixes ENOSPC)
config.resolver.blockList = exclusionList([
  /node_modules\/.*\/android\/.*/,
  /node_modules\/.*\/ios\/.*/,
  /node_modules\/.*\/dist\/.*/,
  /node_modules\/.*\/test\/.*/,
]);

// ✅ Explicitly tell Metro where to find react-native-is-edge-to-edge
config.resolver.extraNodeModules = {
  "react-native-is-edge-to-edge": path.resolve(
    __dirname,
    "node_modules/react-native-is-edge-to-edge"
  ),
};

// Force polling (works on Termux without root)
config.server = {
  ...config.server,
  watchOptions: {
    usePolling: true,
    interval: 1000, // check every 1s
  },
};

module.exports = config;
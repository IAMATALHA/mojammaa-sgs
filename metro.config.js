// Expo SDK 54 default Metro config.
// Required by expo-doctor so it can verify we haven't overridden Metro
// without extending the Expo defaults. Add overrides BELOW the
// `getDefaultConfig(__dirname)` call if you ever need to.

const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

module.exports = config

// Babel config — react-native-reanimated v3+ exige son plugin EN DERNIER.
// expo-router et autres presets sont déjà gérés par 'babel-preset-expo'.
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  }
}

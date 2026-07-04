module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // reanimated 4 ships its worklet babel transform here; MUST be last.
    plugins: ['react-native-worklets/plugin'],
  };
};

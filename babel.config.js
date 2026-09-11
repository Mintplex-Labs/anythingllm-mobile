module.exports = {
  presets: ['module:@react-native/babel-preset', 'nativewind/babel'],
  plugins: [
    ['module:react-native-dotenv', { moduleName: '@env' }],
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    // No reanimated/worklets plugin here: the nativewind/babel preset (css-interop >= 0.2) already adds react-native-worklets/plugin.
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@': './src',
        },
      },
    ],
  ],
};

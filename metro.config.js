const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require("nativewind/metro");

const defaultConfig = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = defaultConfig.resolver;

const configOptions = {
  resolver: {
    assetExts: assetExts.filter(ext => ext !== 'svg'),
    sourceExts: [...sourceExts, 'svg'],
  },
  transformer: {
    babelTransformerPath: require.resolve(
      'react-native-svg-transformer/react-native',
    ),
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
    enableBabelRuntime: true,
  },
};

const config = mergeConfig(getDefaultConfig(__dirname), configOptions);
module.exports = withNativeWind(config, { input: './global.css' });

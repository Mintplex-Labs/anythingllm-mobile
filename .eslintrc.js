module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['coverage/', 'scripts/'],
  rules: {
    'react-hooks/exhaustive-deps': 'off',
    'react-native/no-inline-styles': 'off',
    radix: 'off',
    'no-new': 'off',
  },
};

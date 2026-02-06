const { withAndroidManifest } = require('@expo/config-plugins');

const withNoTabletSupport = (config) => {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest['supports-screens']) {
      manifest['supports-screens'] = [];
    }

    const screensConfig = {
      $: {
        'android:smallScreens': 'true',
        'android:normalScreens': 'true',
        'android:largeScreens': 'false',
        'android:xlargeScreens': 'false',
        'android:requiresSmallestWidthDp': '320',
      },
    };

    manifest['supports-screens'] = [screensConfig];

    return config;
  });
};

module.exports = withNoTabletSupport;

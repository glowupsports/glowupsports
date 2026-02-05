const { withAndroidManifest } = require('@expo/config-plugins');

const withTelephonyRequirement = (config) => {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest['uses-feature']) {
      manifest['uses-feature'] = [];
    }

    const telephonyFeature = {
      $: {
        'android:name': 'android.hardware.telephony',
        'android:required': 'true',
      },
    };

    const existingFeature = manifest['uses-feature'].find(
      (feature) => feature.$?.['android:name'] === 'android.hardware.telephony'
    );

    if (!existingFeature) {
      manifest['uses-feature'].push(telephonyFeature);
    }

    return config;
  });
};

module.exports = withTelephonyRequirement;

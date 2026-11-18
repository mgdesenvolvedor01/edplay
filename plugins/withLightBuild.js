/**
 * Config plugin: deixa o app mais leve.
 * - Inclui ARM (celulares e TV Box) e x86/x86_64 (emuladores de Android no PC, como BlueStacks, LDPlayer e Android Studio).
 * (R8/minify ficou desligado: em alguns aparelhos ele removia peças que o app usa e o app fechava ao abrir.)
 */
const { withGradleProperties, withAndroidManifest } = require('expo/config-plugins');

const PROPS = {
  reactNativeArchitectures: 'armeabi-v7a,arm64-v8a,x86,x86_64',
  'android.enableMinifyInReleaseBuilds': 'false',
  'android.enableProguardInReleaseBuilds': 'false',
  'android.enableShrinkResourcesInReleaseBuilds': 'false',
};

// Desliga o "voltar preditivo" do Android 13+: com ele ligado o BackHandler.exitApp() não fecha o app.
function withNoPredictiveBack(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application && cfg.modResults.manifest.application[0];
    if (app) {
      app.$['android:enableOnBackInvokedCallback'] = 'false';
      (app.activity || []).forEach((a) => {
        a.$['android:enableOnBackInvokedCallback'] = 'false';
      });
    }
    return cfg;
  });
}

module.exports = function withLightBuild(config) {
  config = withNoPredictiveBack(config);
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPS)) {
      const i = cfg.modResults.findIndex((p) => p.type === 'property' && p.key === key);
      if (i >= 0) cfg.modResults[i].value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
};

// Configuração do app EDPLAY (Expo).
// Para publicar uma nova versão na Play Store, aumente "version" e "versionCode".

module.exports = {
  expo: {
    name: 'EDPLAY',
    slug: 'mgplay',
    owner: 'mgpersonalizados01s-team',
    version: '1.0.14',
    orientation: 'default',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    backgroundColor: '#0B0D17',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#0B0D17',
    },
    android: {
      package: 'com.mgplay.app', // precisa ser igual ao registrado no Play Console
      versionCode: 10206,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0B0D17',
      },
      permissions: ['INTERNET', 'ACCESS_NETWORK_STATE', 'WAKE_LOCK'],
      blockedPermissions: [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.RECORD_AUDIO',
      ],
    },
    plugins: [
      'expo-video',
      // Faz o app aparecer na tela inicial de Android TV / TV Box
      ['./plugins/withAndroidTV', { banner: './assets/tv-banner.png' }],
      // APK menor e mais rápido em aparelhos simples
      './plugins/withLightBuild',
    ],
    extra: {
      eas: {
        projectId: '12d849fb-ef33-4931-987e-a3a8e0e96979', // projeto "mgplay" na Expo
      },
    },
  },
};

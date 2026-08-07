import type { CapacitorConfig } from '@capacitor/cli';

// Owner Android app — wraps the same web app (talks to the same Supabase
// project, live) inside a native shell. The Owner logs in once with his
// normal 'owner' account; the app remembers the session and opens straight
// to /owner (the "Everything" tab) from then on.
const config: CapacitorConfig = {
  appId: 'com.cafeaadvikam.owner',
  appName: 'Cafe Aadvikam Owner',
  webDir: 'dist',
  // Local bundled build talks to Supabase over the network at runtime, same
  // as the deployed website — no server.url override needed/wanted here.
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // Local notifications work out of the box with no extra setup — used
    // for the in-app "Needs Your Attention" alerts today.
    LocalNotifications: {
      smallIcon: 'ic_stat_notify',
      iconColor: '#2D7D6F',
    },
    // Remote push (FCM) requires a Firebase project + google-services.json
    // — see ANDROID_APP_SETUP.md. Until that file is added, push tokens
    // simply won't register; nothing else breaks.
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;

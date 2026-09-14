import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.timely.records',
  appName: 'Timely',
  webDir: 'mobile/dist',
  server: { androidScheme: 'https' }
};
export default config;

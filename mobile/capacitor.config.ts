import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.inventory.app',
  appName: 'Inventory App',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
}

export default config

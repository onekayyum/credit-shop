import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.creditshop.app",
  appName: "Credit Shop",
  webDir: "dist",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: true,
  },
};

export default config;

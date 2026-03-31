import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.creditshop.app",
  appName: "Credit Shop",
  webDir: "dist",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
  },
  plugins: {
    Camera: {
      permissions: ["camera"],
    },
  },
};

export default config;

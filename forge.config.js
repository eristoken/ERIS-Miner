// Base configuration
const config = {
  packagerConfig: {
    name: 'ERIS-Miner',
    executableName: 'eris-miner',
    icon: './eris_token_app_icon.icns',
    asar: true,
  },
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        name: 'ERIS-Miner',
        icon: './eris_token_app_icon.icns',
      },
    },
    {
      name: '@electron-forge/maker-wix',
      config: {
        name: 'ERIS-Miner',
        description: 'ERC-918 Token Miner',
        manufacturer: 'ERIS Token',
        icon: './eris_token_app_icon.ico',
        ui: {
          chooseDirectory: true,
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};

// Allow environment variables or CI to override certificate settings
if (process.env.WINDOWS_CERTIFICATE_FILE) {
  const wixMaker = config.makers.find(m => m.name === '@electron-forge/maker-wix');
  if (wixMaker) {
    wixMaker.config.certificateFile = process.env.WINDOWS_CERTIFICATE_FILE;
    wixMaker.config.certificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD;
  }
}

// Allow macOS signing config from environment
if (process.env.APPLE_SIGNING_IDENTITY) {
  config.packagerConfig.osxSign = {
    identity: process.env.APPLE_SIGNING_IDENTITY,
    hardenedRuntime: true,
    entitlements: 'entitlements.plist',
    entitlementsInherit: 'entitlements.plist',
  };
  if (process.env.APPLE_ID && process.env.APPLE_ID_PASSWORD && process.env.APPLE_TEAM_ID) {
    config.packagerConfig.osxNotarize = {
      tool: 'notarytool',
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    };
  }
}

module.exports = config;


// Base configuration
const config = {
  packagerConfig: {
    name: 'ERIS-Miner',
    executableName: 'eris-miner',
    icon: process.platform === 'darwin' ? './eris_token_app_icon.icns' : 
          process.platform === 'win32' ? './eris_token_app_icon.ico' : 
          './eris_token_app_icon.png',
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
    {
      name: '@electron-forge/maker-flatpak',
      config: {
        options: {
          id: 'org.eristoken.miner',
          genericName: 'Cryptocurrency Miner',
          categories: ['Network', 'Finance'],
          mimeType: [],
          runtimeVersion: '24.08',
          base: 'org.electronjs.Electron2.BaseApp',
          baseVersion: '24.08',
          icon: {
            '512x512': './org.eristoken.miner.png',
          },
          desktopFile: './org.eristoken.miner.desktop',
          modules: [],
          bin: 'flatpak/eris-miner-launcher',
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
  // Only log the certificate name part, not the full identity (which may contain sensitive info)
  const identityParts = process.env.APPLE_SIGNING_IDENTITY.split('(');
  const identityName = identityParts[0] || 'Unknown';
  console.log('Configuring code signing with identity:', `${identityName}(...)`);
  config.packagerConfig.osxSign = {
    identity: process.env.APPLE_SIGNING_IDENTITY,
    hardenedRuntime: true,
    entitlements: 'entitlements.plist',
    entitlementsInherit: 'entitlements.plist',
  };
  if (process.env.APPLE_ID && process.env.APPLE_ID_PASSWORD && process.env.APPLE_TEAM_ID) {
    console.log('Configuring notarization (credentials hidden)');
    config.packagerConfig.osxNotarize = {
      tool: 'notarytool',
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    };
  } else {
    console.warn('Notarization not configured - missing credentials:');
    console.warn('  APPLE_ID:', process.env.APPLE_ID ? 'set' : 'NOT SET');
    console.warn('  APPLE_ID_PASSWORD:', process.env.APPLE_ID_PASSWORD ? 'set' : 'NOT SET');
    console.warn('  APPLE_TEAM_ID:', process.env.APPLE_TEAM_ID ? 'set' : 'NOT SET');
  }
} else {
  console.log('Code signing not configured - APPLE_SIGNING_IDENTITY not set');
}

module.exports = config;


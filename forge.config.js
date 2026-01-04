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
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
  hooks: {
    packageAfterCopy: async (config, buildPath, electronVersion, platform, arch) => {
      // For Linux builds, copy wrapper script and post-install script
      if (platform === 'linux') {
        const fs = require('fs');
        const path = require('path');
        
        // Copy wrapper script
        const wrapperPath = path.join(__dirname, 'eris-miner-wrapper.sh');
        const targetWrapperPath = path.join(buildPath, 'eris-miner-wrapper.sh');
        if (fs.existsSync(wrapperPath)) {
          fs.copyFileSync(wrapperPath, targetWrapperPath);
          fs.chmodSync(targetWrapperPath, 0o755);
          console.log('Copied wrapper script to build directory');
        }
        
        // Copy post-install script
        const postinstPath = path.join(__dirname, 'postinst.sh');
        const targetPostinstPath = path.join(buildPath, 'postinst.sh');
        if (fs.existsSync(postinstPath)) {
          fs.copyFileSync(postinstPath, targetPostinstPath);
          fs.chmodSync(targetPostinstPath, 0o755);
          console.log('Copied post-install script to build directory');
        }
      }
    },
    packageAfterMake: async (config, makeResults) => {
      // After packages are created, modify them as needed
      const fs = require('fs');
      const path = require('path');
      const { execSync } = require('child_process');
      
      for (const makeResult of makeResults) {
        if (makeResult.platform === 'linux' && makeResult.artifacts) {
          for (const artifact of makeResult.artifacts) {
            // Handle DEB packages - modify desktop file
            if (artifact.endsWith('.deb')) {
              console.log('Modifying desktop file in DEB package:', artifact);
              try {
                // Extract DEB
                const tempDir = path.join(path.dirname(artifact), 'deb-temp');
                if (fs.existsSync(tempDir)) {
                  fs.rmSync(tempDir, { recursive: true, force: true });
                }
                fs.mkdirSync(tempDir, { recursive: true });
                
                // Extract control.tar.gz and data.tar.gz
                execSync(`cd "${tempDir}" && ar x "${artifact}"`, { stdio: 'inherit' });
                
                // Extract data.tar.gz to modify desktop file
                const dataExtractDir = path.join(tempDir, 'data');
                fs.mkdirSync(dataExtractDir, { recursive: true });
                execSync(`cd "${dataExtractDir}" && tar -xzf "${tempDir}/data.tar.gz"`, { stdio: 'inherit' });
                
                // Modify desktop file
                const desktopFile = path.join(dataExtractDir, 'usr/share/applications/eris-miner.desktop');
                if (fs.existsSync(desktopFile)) {
                  let desktopContent = fs.readFileSync(desktopFile, 'utf8');
                  // Check if Exec line already has XDG_SESSION_TYPE
                  if (!desktopContent.includes('XDG_SESSION_TYPE=x11')) {
                    // Modify Exec line to include env XDG_SESSION_TYPE=x11
                    desktopContent = desktopContent.replace(
                      /^Exec=(.*)$/m,
                      'Exec=env XDG_SESSION_TYPE=x11 $1'
                    );
                    fs.writeFileSync(desktopFile, desktopContent);
                    console.log('Modified desktop file to include XDG_SESSION_TYPE=x11');
                    
                    // Repackage data.tar.gz
                    execSync(`cd "${dataExtractDir}" && tar -czf "${tempDir}/data.tar.gz" usr`, { stdio: 'inherit' });
                    
                    // Repackage DEB
                    execSync(`cd "${tempDir}" && ar r "${artifact}" control.tar.gz data.tar.gz debian-binary`, { stdio: 'inherit' });
                    
                    console.log('Successfully modified DEB package');
                  } else {
                    console.log('Desktop file already has XDG_SESSION_TYPE=x11');
                  }
                } else {
                  console.warn('Desktop file not found in DEB package');
                }
                
                // Cleanup
                fs.rmSync(tempDir, { recursive: true, force: true });
              } catch (error) {
                console.error('Error modifying DEB package:', error.message);
                console.log('Falling back to post-install script method');
              }
            }
            
            // Handle Snap packages - modify snapcraft.yaml before building
            // Note: This runs before the snap is actually built, so we need to find the temp directory
            // Actually, snapcraft.yaml is generated in a temp directory during the build process
            // We'll need to use a different hook or approach
          }
        }
      }
    },
    preMake: async (config, makeResults) => {
      // Before making, patch the snapcraft template if building snap with core24
      if (process.env.BUILD_SNAP === 'true' || process.env.BUILD_SNAP === '1') {
        console.log('Snap build detected - patching snapcraft template for core24');
        const fs = require('fs');
        const path = require('path');
        
        // Patch the strict template to use 'gnome' instead of 'gnome-3-34' for core24
        const templatePath = path.join(__dirname, 'node_modules', 'electron-installer-snap', 'resources', 'strict', 'snapcraft.yaml');
        if (fs.existsSync(templatePath)) {
          let templateContent = fs.readFileSync(templatePath, 'utf8');
          // Replace gnome-3-34 with gnome (compatible with core24)
          if (templateContent.includes('gnome-3-34')) {
            templateContent = templateContent.replace(/gnome-3-34/g, 'gnome');
            fs.writeFileSync(templatePath, templateContent);
            console.log('Patched snapcraft template: replaced gnome-3-34 with gnome (for core24)');
          }
        } else {
          console.warn('Snapcraft template not found at:', templatePath);
        }
      }
    },
  },
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

// Conditionally include DEB or Snap maker based on BUILD_SNAP environment variable
// This ensures only one Linux package format is built at a time
if (process.env.BUILD_SNAP === 'true' || process.env.BUILD_SNAP === '1') {
  console.log('Including Snap maker (BUILD_SNAP is set) - DEB will be excluded');
  config.makers.push({
    name: '@electron-forge/maker-snap',
    config: {
      // All options must be at top level (not nested in 'options') to be passed to electron-installer-snap
      base: 'core24', // Use core24 base (Ubuntu 24.04) instead of deprecated core18
      name: 'eris-miner',
      productName: 'ERIS Miner',
      genericName: 'Cryptocurrency Miner',
      description: 'ERC-918 Token Miner for ERIS and compatible tokens',
      summary: 'ERC-918 Token Miner for ERIS and compatible tokens',
      categories: ['Network', 'Finance'],
      icon: './eris_token_app_icon.png',
    },
  });
} else {
  console.log('Including DEB maker (BUILD_SNAP not set) - Snap will be excluded');
  config.makers.push({
    name: '@electron-forge/maker-deb',
    config: {
      options: {
        name: 'eris-miner',
        productName: 'ERIS Miner',
        genericName: 'Cryptocurrency Miner',
        description: 'ERC-918 Token Miner for ERIS and compatible tokens',
        categories: ['Network', 'Finance'],
        icon: './eris_token_app_icon.png',
        maintainer: 'ERIS Token',
        homepage: 'https://github.com/yourusername/ERIS-Miner',
        section: 'utils',
        priority: 'optional',
        bin: 'eris-miner',
        scripts: {
          postinst: 'postinst.sh',
        },
      },
    },
  });
}

module.exports = config;


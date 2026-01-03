# Packaging and CI/CD Setup

This document describes the Electron Forge packaging setup and GitHub Actions workflows.

## Electron Forge Configuration

The project uses Electron Forge for packaging the application into distributable formats:
- **macOS**: DMG files
- **Windows**: MSI files (via WiX)
- **Linux**: Flatpak packages

### Installation

Dependencies are already installed via `npm install`. The following packages are used:
- `@electron-forge/cli` - Main Forge CLI
- `@electron-forge/maker-dmg` - macOS DMG maker
- `@electron-forge/maker-wix` - Windows MSI maker
- `@electron-forge/plugin-auto-unpack-natives` - Native module handling

### Build Process

1. **Development Build**: `npm run build`
   - Builds React app to `dist/`
   - Compiles Electron TypeScript to `dist-electron/`

2. **Package**: `npm run package` (or `package:mac` / `package:win`)
   - Creates an unpacked application bundle

3. **Make**: `npm run make` (or `make:mac` / `make:win` / `make:linux`)
   - Creates distributable installers (DMG for macOS, MSI for Windows)
   - Outputs to `out/make/`
   - Linux output is used for Flatpak bundling in CI

### Configuration

The Forge configuration is in `forge.config.js`:
- **Packager Config**: Sets app name, executable name, and icon
- **Makers**: Configured for DMG (macOS) and WiX (Windows)
- **Plugins**: Auto-unpack natives for native module support
- **Code Signing**: Supports macOS and Windows code signing via environment variables

## GitHub Actions CI/CD

The project uses a unified CI/CD workflow located in `.github/workflows/ci.yml`.

### Trigger Conditions

- **Automatic**: Runs on every push to `main` branch
- **Manual**: Can be triggered manually via GitHub Actions UI (workflow_dispatch)

### Pipeline Jobs

The workflow consists of the following jobs:

#### 1. Build (`build`)
- **Runner**: Ubuntu
- **Purpose**: Build the React app and Electron main process
- **Outputs**: Uploads `dist/` and `dist-electron/` as artifacts

#### 2. Package macOS (`package-macos`)
- **Runner**: macOS
- **Purpose**: Create signed and notarized DMG installer
- **Features**:
  - Downloads build artifacts from the build job
  - Supports code signing with Apple Developer certificates
  - Supports notarization with Apple's notary service
  - Falls back to unsigned builds if certificates aren't configured

#### 3. Package Windows (`package-windows`)
- **Runner**: Windows
- **Purpose**: Create MSI installer
- **Features**:
  - Downloads build artifacts from the build job
  - Supports code signing with Windows certificates

#### 4. Package Linux (`package-linux`)
- **Runner**: Ubuntu
- **Purpose**: Create Flatpak package
- **Features**:
  - Uses `@electron-forge/maker-flatpak` for Flatpak generation
  - Includes desktop integration (icon, categories)

#### 5. Publish Release (`publish-release`)
- **Runner**: Ubuntu
- **Purpose**: Create GitHub release with all platform artifacts
- **Features**:
  - Downloads all platform artifacts
  - Creates a GitHub release tagged with the version from `package.json`
  - Attaches DMG, MSI, and Flatpak files to the release

### Artifacts

Artifacts are named with the version from `package.json`:
- `eris-miner-macos-dmg-{version}` - macOS DMG installer
- `eris-miner-windows-msi-{version}` - Windows MSI installer
- `eris-miner-linux-flatpak-{version}` - Linux Flatpak package

## Release Workflow

Releases are automated! Simply:

1. **Update version** in `package.json`
2. **Push to main**:
   ```bash
   git add .
   git commit -m "Release v1.0.0"
   git push origin main
   ```
3. **Wait for CI** - The workflow will automatically:
   - Build for all platforms
   - Create a GitHub release
   - Attach all installers to the release

## Local Testing

To test packaging locally:

```bash
# Build the application
npm run build

# Package for current platform
npm run make

# Or package for specific platform
npm run make:mac     # macOS
npm run make:win     # Windows
npm run make:linux   # Linux
```

Outputs will be in `out/make/` directory.

## Code Signing

Code signing is **optional** but **highly recommended** for distribution. The configuration supports code signing for both macOS and Windows, but it will work without signing if certificates are not provided.

**See [CODE_SIGNING.md](./CODE_SIGNING.md) for detailed setup instructions.**

### Quick Summary:
- **macOS**: Requires Apple Developer account ($99/year) and certificates
- **Windows**: Requires code signing certificate from a CA
- **GitHub Actions**: Add secrets for certificates to enable signing in CI/CD
- **Without signing**: Installers will work but users will see security warnings

### GitHub Secrets for Code Signing

To enable code signing in CI, configure these secrets in your repository:

**macOS:**
- `APPLE_CERTIFICATE` - Base64-encoded .p12 certificate file
- `APPLE_CERTIFICATE_PASSWORD` - Password for the certificate
- `APPLE_SIGNING_IDENTITY` - Certificate identity (e.g., "Developer ID Application: Your Name")
- `APPLE_ID` - Apple ID email for notarization
- `APPLE_ID_PASSWORD` - App-specific password for notarization
- `APPLE_TEAM_ID` - Apple Developer Team ID

**Windows:**
- `WINDOWS_CERTIFICATE` - Base64-encoded .pfx certificate file
- `WINDOWS_CERTIFICATE_PASSWORD` - Password for the certificate

## Notes

- The app icon (`eris_token_app_icon.png`) is used for both the app bundle and installers
- Platform-specific icons: `.icns` for macOS, `.ico` for Windows
- Windows MSI packaging requires WiX Toolset (automatically installed in GitHub Actions)
- macOS DMG creation requires macOS (automatically available in GitHub Actions macOS runners)
- Linux Flatpak is built using `@electron-forge/maker-flatpak`
- Code signing configuration is optional - builds will work without certificates


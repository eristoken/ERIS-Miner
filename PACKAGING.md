# Packaging and CI/CD Setup

This document describes the Electron Forge packaging setup and GitHub Actions workflows.

## Electron Forge Configuration

The project uses Electron Forge for packaging the application into distributable formats:
- **macOS**: DMG files
- **Windows**: MSIX files (via WiX)

### Installation

Dependencies are already installed via `npm install`. The following packages are used:
- `@electron-forge/cli` - Main Forge CLI
- `@electron-forge/maker-dmg` - macOS DMG maker
- `@electron-forge/maker-wix` - Windows MSIX maker
- `@electron-forge/plugin-auto-unpack-natives` - Native module handling

### Build Process

1. **Development Build**: `npm run build`
   - Builds React app to `dist/`
   - Compiles Electron TypeScript to `dist-electron/`

2. **Package**: `npm run package` (or `package:mac` / `package:win`)
   - Creates an unpacked application bundle

3. **Make**: `npm run make` (or `make:mac` / `make:win`)
   - Creates distributable installers (DMG for macOS, MSIX for Windows)
   - Outputs to `out/make/`

### Configuration

The Forge configuration is in `package.json` under `config.forge`:
- **Packager Config**: Sets app name, executable name, and icon
- **Makers**: Configured for DMG (macOS) and WiX (Windows)
- **Plugins**: Auto-unpack natives for native module support

## GitHub Actions Workflows

All workflows are manual (`workflow_dispatch`) and located in `.github/workflows/`:

### 1. Build Workflow (`build.yml`)

**Purpose**: Build the application and upload artifacts

**Usage**:
- Go to Actions → Build → Run workflow
- No inputs required

**Outputs**:
- Build artifacts uploaded to GitHub Actions artifacts

### 2. Package macOS (`package-macos.yml`)

**Purpose**: Build and package the app for macOS as a DMG

**Usage**:
- Go to Actions → Package macOS → Run workflow
- Input: `version` (e.g., `v1.0.0`)

**Outputs**:
- DMG file uploaded as artifact: `eris-miner-macos-{version}`
- If run on a tag, automatically creates a GitHub release

### 3. Package Windows (`package-windows.yml`)

**Purpose**: Build and package the app for Windows as MSIX

**Usage**:
- Go to Actions → Package Windows → Run workflow
- Input: `version` (e.g., `v1.0.0`)

**Outputs**:
- MSIX file uploaded as artifact: `eris-miner-windows-{version}`
- If run on a tag, automatically creates a GitHub release

### 4. Publish Release (`publish-release.yml`)

**Purpose**: Create a GitHub release with both macOS and Windows packages

**Usage**:
- Go to Actions → Publish Release → Run workflow
- Inputs:
  - `version`: Version tag (e.g., `v1.0.0`)
  - `release_notes`: Optional release notes

**Prerequisites**:
- Both macOS and Windows packages must be built first (using the respective workflows)
- Artifacts must be available with names matching `eris-miner-macos-{version}` and `eris-miner-windows-{version}`

**Outputs**:
- GitHub release with both DMG and MSIX files attached

## Release Workflow

Recommended workflow for creating a release:

1. **Tag the release**:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **Build macOS package**:
   - Run "Package macOS" workflow with version `v1.0.0`
   - Wait for completion

3. **Build Windows package**:
   - Run "Package Windows" workflow with version `v1.0.0`
   - Wait for completion

4. **Publish release**:
   - Run "Publish Release" workflow with version `v1.0.0` and release notes
   - This will create a GitHub release with both packages attached

## Local Testing

To test packaging locally:

```bash
# Build the application
npm run build

# Package for current platform
npm run make

# Or package for specific platform
npm run make:mac   # macOS
npm run make:win    # Windows
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

## Notes

- The app icon (`eris_token_app_icon.png`) is used for both the app bundle and installers
- Windows MSIX packaging requires WiX Toolset (automatically installed in GitHub Actions)
- macOS DMG creation requires macOS (automatically available in GitHub Actions macOS runners)
- Code signing configuration is optional - builds will work without certificates


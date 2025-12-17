# Code Signing Setup

Code signing is **recommended** for distributing Electron applications. It helps users trust your application and prevents security warnings.

## macOS Code Signing

### Requirements

1. **Apple Developer Account** ($99/year)
   - Sign up at https://developer.apple.com
   - Required for code signing and notarization

2. **Certificates** (created in Apple Developer Portal)
   - **Developer ID Application**: For signing the app bundle
   - **Developer ID Installer**: For signing the DMG (optional but recommended)

3. **App-Specific Password** (for notarization)
   - Create at https://appleid.apple.com
   - Required for notarization (recommended for distribution)

### Setup Steps

1. **Create Certificates in Apple Developer Portal**:
   - Go to https://developer.apple.com/account/resources/certificates/list
   - Create "Developer ID Application" certificate
   - Create "Developer ID Installer" certificate (optional)
   - Download and install in Keychain Access

2. **Get Certificate Common Name**:
   ```bash
   security find-identity -v -p codesigning
   ```
   Look for "Developer ID Application: Your Name (TEAM_ID)"

3. **Create App-Specific Password**:
   - Go to https://appleid.apple.com
   - Sign in → App-Specific Passwords → Generate
   - Save the password securely

4. **Configure in package.json**:
   See the `packagerConfig` section in `package.json` for signing configuration.

### Configuration

Code signing is configured in `package.json` under `config.forge.packagerConfig`:

```json
{
  "osxSign": {
    "identity": "Developer ID Application: Your Name (TEAM_ID)",
    "hardenedRuntime": true,
    "entitlements": "entitlements.plist",
    "entitlementsInherit": "entitlements.plist"
  },
  "osxNotarize": {
    "tool": "notarytool",
    "appleId": "your-email@example.com",
    "appleIdPassword": "@env:APPLE_ID_PASSWORD",
    "teamId": "YOUR_TEAM_ID"
  }
}
```

### GitHub Actions Setup

For CI/CD, you need to:

1. **Add GitHub Secrets**:
   - `APPLE_CERTIFICATE`: Base64-encoded .p12 certificate file
   - `APPLE_CERTIFICATE_PASSWORD`: Password for the certificate
   - `APPLE_ID`: Your Apple ID email
   - `APPLE_ID_PASSWORD`: App-specific password
   - `APPLE_TEAM_ID`: Your Apple Developer Team ID

2. **Import Certificate in Workflow**:
   The workflow will automatically import the certificate and configure signing.

## Windows Code Signing

### Requirements

1. **Code Signing Certificate**
   - Purchase from a Certificate Authority (CA) like:
     - DigiCert
     - Sectigo (formerly Comodo)
     - GlobalSign
     - Or use a self-signed certificate (not recommended for distribution)

2. **Certificate File**
   - Usually a `.pfx` or `.p12` file
   - Contains both the certificate and private key

### Setup Steps

1. **Obtain Certificate**:
   - Purchase from a CA or create a self-signed certificate
   - Self-signed certificates will show warnings to users

2. **Configure in package.json**:
   See the `makers` section for Windows signing configuration.

### Configuration

Windows signing is configured in the WiX maker config:

```json
{
  "name": "@electron-forge/maker-wix",
  "config": {
    "certificateFile": "./certificate.pfx",
    "certificatePassword": "@env:CERTIFICATE_PASSWORD"
  }
}
```

### GitHub Actions Setup

For CI/CD, you need to:

1. **Add GitHub Secrets**:
   - `WINDOWS_CERTIFICATE`: Base64-encoded .pfx certificate file
   - `WINDOWS_CERTIFICATE_PASSWORD`: Password for the certificate

2. **Import Certificate in Workflow**:
   The workflow will automatically import the certificate and configure signing.

## Current Status

**Code signing is NOT currently configured.** The installers will be created without signatures.

### Without Code Signing:

- **macOS**: Users will see "unidentified developer" warnings. Gatekeeper may block the app.
- **Windows**: Windows Defender SmartScreen may show warnings. Users may need to click "More info" → "Run anyway".

### With Code Signing:

- **macOS**: No warnings, smooth installation. App can be notarized for additional trust.
- **Windows**: No SmartScreen warnings. Users can install with confidence.

## Optional: Start Without Signing

You can distribute unsigned installers, but users will see security warnings. This is acceptable for:
- Internal/private distribution
- Early beta releases
- Open source projects where users can verify the source code

## Next Steps

1. **For macOS**: Set up Apple Developer account and certificates
2. **For Windows**: Purchase or create a code signing certificate
3. **Update package.json**: Add signing configuration (see examples above)
4. **Update GitHub Actions**: Add certificate import steps
5. **Test locally**: Verify signing works before pushing to CI/CD

## Testing Code Signing Locally

### macOS:
```bash
# Check if app is signed
codesign -dv --verbose=4 out/ERIS-Miner-darwin-x64/ERIS-Miner.app

# Verify signature
codesign --verify --verbose out/ERIS-Miner-darwin-x64/ERIS-Miner.app
```

### Windows:
```bash
# Check if MSIX is signed (PowerShell)
Get-AppxPackageManifest -PackagePath "out\make\ERIS-Miner-Setup-0.0.1.msix"
```

## Resources

- [Electron Code Signing Guide](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [Apple Code Signing](https://developer.apple.com/documentation/security/code_signing_services)
- [Windows Code Signing](https://docs.microsoft.com/en-us/windows/win32/win_cert/code-signing-best-practices)


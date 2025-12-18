/**
 * Electron Forge WiX Hook
 * Adds a custom action to launch the app after installation completes
 * 
 * This hook modifies the WiX installer XML to add:
 * 1. A CustomAction that launches the app executable
 * 2. An InstallExecuteSequence entry to run the action after installation
 */
const fs = require('fs');
const path = require('path');

module.exports = function(creator) {
  const wxsPath = path.join(creator.directory, 'main.wxs');
  
  if (!fs.existsSync(wxsPath)) {
    console.warn('WiX template file not found:', wxsPath);
    return;
  }
  
  let wxsContent = fs.readFileSync(wxsPath, 'utf8');
  
  // Check if custom action already exists
  if (wxsContent.includes('Id="LaunchApp"')) {
    console.log('LaunchApp custom action already exists in WiX template');
    return;
  }
  
  // Define the CustomAction - this launches the app executable
  const customAction = `    <CustomAction 
      Id="LaunchApp" 
      Directory="INSTALLDIR" 
      ExeCommand="[INSTALLDIR]eris-miner.exe" 
      Return="asyncNoWait" />
`;
  
  // Define the InstallExecuteSequence - runs the custom action after InstallFinalize
  // "NOT Installed" condition means it only runs on fresh installs, not upgrades
  const installSequence = `    <InstallExecuteSequence>
      <Custom Action="LaunchApp" After="InstallFinalize">NOT Installed</Custom>
    </InstallExecuteSequence>
`;
  
  // Insert CustomAction and InstallExecuteSequence before the closing </Product> tag
  // This is the standard location for these elements in WiX files
  if (wxsContent.includes('</Product>')) {
    wxsContent = wxsContent.replace(
      /(\s*)(<\/Product>)/,
      '$1' + customAction + '\n' + installSequence + '$1$2'
    );
    fs.writeFileSync(wxsPath, wxsContent);
    console.log('✓ Added LaunchApp custom action to WiX installer');
  } else {
    console.warn('Could not find </Product> tag in WiX template');
  }
};


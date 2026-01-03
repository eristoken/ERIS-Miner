// Force X11 on Linux to avoid Wayland issues
// Must be set before importing Electron
if (process.platform === 'linux') {
  process.env.ELECTRON_OZONE_PLATFORM_HINT = 'x11';
  // Additional Raspberry Pi / ARM64 optimizations
  process.env.ELECTRON_DISABLE_SANDBOX = '1'; // May help on some ARM systems
}

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// Enhanced Linux/Raspberry Pi configuration
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform', 'x11');
  app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform');
  
  // Disable GPU acceleration on ARM/Raspberry Pi to prevent GPU process crashes
  // Raspberry Pi and many ARM systems don't have compatible GPU drivers for Electron
  if (process.arch === 'arm64' || process.arch === 'arm') {
    console.log('ARM architecture detected - disabling GPU acceleration');
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-gpu-compositing');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    // Also disable hardware acceleration
    app.disableHardwareAcceleration();
  }
  
  // Log platform info for debugging
  console.log('Linux platform detected');
  console.log('Architecture:', process.arch);
  console.log('Platform:', process.platform);
  console.log('DISPLAY:', process.env.DISPLAY || 'not set');
  console.log('XDG_SESSION_TYPE:', process.env.XDG_SESSION_TYPE || 'not set');
  console.log('GPU acceleration:', process.arch === 'arm64' || process.arch === 'arm' ? 'disabled (ARM)' : 'enabled');
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

// Get config file directory
// In development: use project root (next to dist-electron)
// In production: use user data directory (writable location outside asar)
function getConfigDir(): string {
  if (app.isPackaged) {
    // In packaged app, use user data directory (writable)
    return app.getPath('userData');
  } else {
    // In development, use project root
    return path.join(__dirname, '..');
  }
}

// Initialize config file paths (will be set after app is ready)
let CONFIG_DIR = '';
let SETTINGS_FILE = '';
let CHAINS_FILE = '';
let RPCS_FILE = '';
let CONTRACTS_FILE = '';
let APP_ICON = '';

// Initialize config paths - must be called after app is ready
function initConfigPaths() {
  CONFIG_DIR = getConfigDir();
  SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
  CHAINS_FILE = path.join(CONFIG_DIR, 'chains.json');
  RPCS_FILE = path.join(CONFIG_DIR, 'rpcs.json');
  
  // Contracts file: try app bundle first, then user data
  const PROJECT_ROOT = path.join(__dirname, '..');
  const BUNDLE_CONTRACTS = path.join(PROJECT_ROOT, 'contracts.json');
  const USER_CONTRACTS = path.join(CONFIG_DIR, 'contracts.json');
  // Prefer bundle contracts if it exists, otherwise use user data
  CONTRACTS_FILE = fs.existsSync(BUNDLE_CONTRACTS) ? BUNDLE_CONTRACTS : USER_CONTRACTS;
  
  // App icon is always from the app bundle (not user data)
  APP_ICON = path.join(PROJECT_ROOT, 'eris_token_app_icon.png');
  
  // Ensure config directory exists
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  
  // Log file paths for debugging
  console.log('Config directory:', CONFIG_DIR);
  console.log('Settings file:', SETTINGS_FILE);
  console.log('Chains file:', CHAINS_FILE);
  console.log('RPCs file:', RPCS_FILE);
  console.log('Contracts file:', CONTRACTS_FILE);
  console.log('isPackaged:', app.isPackaged);
}

// Initialize default config files if they don't exist
function initConfigFiles() {
  // Ensure paths are initialized
  if (!CONFIG_DIR) {
    initConfigPaths();
  }
  
  const defaultSettings = {
    mining_account_public_address: '0xYourMiningAddressHere',
    mining_account_private_key: '0xYourPrivateKeyHere',
    network_type: 'mainnet',
    gas_price_gwei: 0.00005,
    priority_gas_fee_gwei: 0.000005,
    gas_limit: 250000,
    cpu_thread_count: 1,
    gpu_mining_enabled: false,
    gpu_workgroup_size: 256,
    gpu_workgroup_count: 4096,
    rpc_rate_limit_ms: 500,
    submission_rate_limit_ms: 1000,
    challenge_poll_interval_ms: 2000,
    rpc_switch_delay_seconds: 20,
    selected_chain_id: '8453',
  };

  const defaultChains = {
    // Mainnet Chains
    '1': {
      name: 'Ethereum Mainnet',
      chainId: 1,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    },
    '8453': {
      name: 'Base',
      chainId: 8453,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    },
    '42161': {
      name: 'Arbitrum One',
      chainId: 42161,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    },
    '137': {
      name: 'Polygon',
      chainId: 137,
      nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    },
    '56': {
      name: 'BNB Chain',
      chainId: 56,
      nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    },
    // Testnet Chains
    '84532': {
      name: 'Base Sepolia',
      chainId: 84532,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    },
    '421614': {
      name: 'Arbitrum Sepolia',
      chainId: 421614,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    },
    '97': {
      name: 'BNB Testnet',
      chainId: 97,
      nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    },
  };

  const defaultRpcs = {
    // Mainnet RPCs
    '1': [
      { url: 'https://eth.llamarpc.com', name: 'LlamaRPC' },
      { url: 'https://rpc.ankr.com/eth', name: 'Ankr' },
    ],
    '8453': [
      { url: 'https://mainnet.base.org', name: 'Base Official' },
      { url: 'https://base.llamarpc.com', name: 'LlamaRPC' },
    ],
    '42161': [
      { url: 'https://arb1.arbitrum.io/rpc', name: 'Arbitrum Official' },
      { url: 'https://arbitrum.llamarpc.com', name: 'LlamaRPC' },
    ],
    '137': [
      { url: 'https://polygon-rpc.com', name: 'Polygon Official' },
      { url: 'https://polygon.llamarpc.com', name: 'LlamaRPC' },
    ],
    '56': [
      { url: 'https://bsc-dataseed.binance.org', name: 'Binance Official' },
      { url: 'https://bsc.llamarpc.com', name: 'LlamaRPC' },
    ],
    // Testnet RPCs
    '84532': [
      { url: 'https://sepolia.base.org', name: 'Base Sepolia Official' },
      { url: 'https://base-sepolia-rpc.publicnode.com', name: 'PublicNode' },
    ],
    '421614': [
      { url: 'https://sepolia-rollup.arbitrum.io/rpc', name: 'Arbitrum Sepolia Official' },
      { url: 'https://arbitrum-sepolia-rpc.publicnode.com', name: 'PublicNode' },
    ],
    '97': [
      { url: 'https://data-seed-prebsc-1-s1.binance.org:8545', name: 'Binance Testnet 1' },
      { url: 'https://data-seed-prebsc-2-s1.binance.org:8545', name: 'Binance Testnet 2' },
      { url: 'https://bsc-testnet-rpc.publicnode.com', name: 'PublicNode' },
    ],
  };

  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
  }
  if (!fs.existsSync(CHAINS_FILE)) {
    fs.writeFileSync(CHAINS_FILE, JSON.stringify(defaultChains, null, 2));
  }
  if (!fs.existsSync(RPCS_FILE)) {
    fs.writeFileSync(RPCS_FILE, JSON.stringify(defaultRpcs, null, 2));
  }
  // contracts.json should already exist, but we don't create a default here
}

function createWindow() {
  // Resolve preload path - works in both dev and production
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('Preload path:', preloadPath);
  console.log('Preload exists:', fs.existsSync(preloadPath));
  
  // On Raspberry Pi/Linux, use smaller initial window size and simpler settings
  const isLinux = process.platform === 'linux';
  const isARM = process.arch === 'arm64' || process.arch === 'arm';
  
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: isLinux && isARM ? 1024 : 1280, // Smaller for Raspberry Pi
    height: isLinux && isARM ? 768 : 1024,  // Smaller for Raspberry Pi
    icon: fs.existsSync(APP_ICON) ? APP_ICON : undefined,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: false, // Don't show until ready
    // Additional options for Raspberry Pi
    ...(isLinux && isARM ? {
      backgroundColor: '#1a1a1a', // Dark background to prevent flash
      frame: true,
      titleBarStyle: 'default',
    } : {}),
  };
  
  console.log('Creating window with options:', {
    width: windowOptions.width,
    height: windowOptions.height,
    platform: process.platform,
    arch: process.arch,
  });
  
  try {
    mainWindow = new BrowserWindow(windowOptions);
    console.log('Window created successfully');
  } catch (windowError) {
    console.error('Failed to create window:', windowError);
    console.error('Window error stack:', windowError instanceof Error ? windowError.stack : 'No stack trace');
    throw windowError;
  }

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    if (mainWindow) {
      try {
        mainWindow.show();
        console.log('Window shown successfully');
        // Focus the window
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        }
      } catch (showError) {
        console.error('Error showing window:', showError);
      }
    }
  });

  // Fallback: show window after timeout in case ready-to-show never fires
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('Window not shown after timeout, forcing show...');
      try {
        mainWindow.show();
        if (mainWindow.isVisible()) {
          console.log('Window forced to show successfully');
        } else {
          console.error('Window show() called but window is still not visible');
        }
      } catch (showError) {
        console.error('Error forcing window to show:', showError);
      }
    } else if (mainWindow && mainWindow.isVisible()) {
      console.log('Window is already visible');
    }
  }, 3000);
  
  // Additional fallback for Raspberry Pi - longer timeout
  if (isLinux && isARM) {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isVisible()) {
        console.log('Raspberry Pi: Window still not visible after 5 seconds, trying again...');
        try {
          mainWindow.show();
          mainWindow.focus();
        } catch (retryError) {
          console.error('Error in retry show:', retryError);
        }
      }
    }, 5000);
  }

  // Handle load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorCode, errorDescription, validatedURL);
    console.error('Error code:', errorCode);
    console.error('Error description:', errorDescription);
    console.error('Failed URL:', validatedURL);
    if (mainWindow) {
      mainWindow.show(); // Show window even on error for debugging
      // Show error page with details
      mainWindow.loadURL(`data:text/html,<h1>Failed to Load Application</h1><p>Error Code: ${errorCode}</p><p>Error: ${errorDescription}</p><p>URL: ${validatedURL}</p><p>Please check the console for more details.</p>`);
    }
  });
  
  // Handle renderer process crashes
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process crashed:', details);
    console.error('Reason:', details.reason);
    console.error('Exit code:', details.exitCode);
    if (mainWindow) {
      mainWindow.loadURL(`data:text/html,<h1>Renderer Process Crashed</h1><p>Reason: ${details.reason}</p><p>Exit Code: ${details.exitCode}</p><p>Please restart the application.</p>`);
    }
  });
  
  // Handle uncaught exceptions in renderer
  mainWindow.webContents.on('unresponsive', () => {
    console.error('Renderer process became unresponsive');
  });
  
  mainWindow.webContents.on('responsive', () => {
    console.log('Renderer process became responsive again');
  });

  // Track if content loaded successfully
  let contentLoaded = false;
  
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('Content finished loading');
    contentLoaded = true;
    // Ensure window is visible after content loads
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('Window not visible after content load, showing...');
      mainWindow.show();
      mainWindow.focus();
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, resolve path relative to __dirname
    // __dirname in packaged app: app.asar/dist-electron
    // So ../dist/index.html resolves to app.asar/dist/index.html
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    console.log('Loading index.html from:', indexPath);
    console.log('App path:', app.getAppPath());
    console.log('__dirname:', __dirname);
    console.log('isPackaged:', app.isPackaged);
    
    // loadFile works with asar paths, so we don't need to check existsSync
    // The error handler above will catch any load failures
    mainWindow.loadFile(indexPath).then(() => {
      console.log('Successfully loaded index.html');
    }).catch((error) => {
      console.error('Failed to load index.html:', error);
      if (!mainWindow) return;
      // Fallback: try with app.getAppPath()
      const altPath = path.join(app.getAppPath(), 'dist', 'index.html');
      console.log('Trying alternative path:', altPath);
      mainWindow.loadFile(altPath).catch((altError) => {
        console.error('Failed to load from alternative path:', altError);
        // Show error page
        if (mainWindow) {
          mainWindow.loadURL('data:text/html,<h1>Error: Failed to load application</h1><p>Please check the console for details.</p>');
          mainWindow.show();
        }
      });
    });
  }
  
  // Final check after a delay to ensure window is visible
  setTimeout(() => {
    if (mainWindow) {
      const isVisible = mainWindow.isVisible();
      const isDestroyed = mainWindow.isDestroyed();
      console.log('Window status check:');
      console.log('  Visible:', isVisible);
      console.log('  Destroyed:', isDestroyed);
      console.log('  Content loaded:', contentLoaded);
      
      if (!isDestroyed && !isVisible) {
        console.log('Window exists but not visible - forcing show');
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      console.log('Window is null in final check');
    }
  }, 2000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  try {
    console.log('App is ready, initializing...');
    console.log('isDev:', isDev);
    console.log('isPackaged:', app.isPackaged);
    console.log('Platform:', process.platform);
    console.log('Architecture:', process.arch);
    console.log('Node version:', process.versions.node);
    console.log('Electron version:', process.versions.electron);
    console.log('Chrome version:', process.versions.chrome);
    
    // Initialize config paths first (requires app to be ready for userData path)
    initConfigPaths();
    // Then initialize default config files if they don't exist
    initConfigFiles();
    // Finally create the window
    createWindow();
  } catch (error) {
    console.error('Error during app initialization:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    // Still try to initialize paths and create window for debugging
    try {
      initConfigPaths();
      initConfigFiles();
    } catch (e) {
      console.error('Error initializing config:', e);
      console.error('Config error stack:', e instanceof Error ? e.stack : 'No stack trace');
    }
    try {
      createWindow();
    } catch (windowError) {
      console.error('Error creating window:', windowError);
      console.error('Window error stack:', windowError instanceof Error ? windowError.stack : 'No stack trace');
      // Try to show error in a basic window
      try {
        const errorWindow = new BrowserWindow({
          width: 800,
          height: 600,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        });
        errorWindow.loadURL(`data:text/html,<h1>Application Error</h1><pre>${String(error)}</pre><pre>${windowError instanceof Error ? windowError.stack : String(windowError)}</pre>`);
      } catch (finalError) {
        console.error('Failed to create error window:', finalError);
      }
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((error) => {
  console.error('Failed to initialize app:', error);
  console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
  // Try to show error dialog if possible
  if (app.isReady()) {
    try {
      dialog.showErrorBox('Application Failed to Start', 
        `The application failed to initialize.\n\nError: ${error instanceof Error ? error.message : String(error)}\n\nPlease check the console for more details.`);
    } catch (dialogError) {
      console.error('Failed to show error dialog:', dialogError);
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('read-settings', () => {
  try {
    // Ensure paths are initialized
    if (!CONFIG_DIR) {
      initConfigPaths();
    }
    
    if (!fs.existsSync(SETTINGS_FILE)) {
      console.log(`Settings file not found at: ${SETTINGS_FILE}`);
      // Try to create default settings
      initConfigFiles();
      // Check again after initialization
      if (!fs.existsSync(SETTINGS_FILE)) {
        console.error(`Failed to create settings file at: ${SETTINGS_FILE}`);
        return null;
      }
    }
    const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(data);
    
    let needsSave = false;
    
    // Migration: Add gas_limit if missing
    if (!settings.gas_limit) {
      settings.gas_limit = 200000; // Default from MVis-tokenminer
      needsSave = true;
    }
    
    // Migration: Add GPU mining settings if missing
    if (settings.gpu_mining_enabled === undefined) {
      settings.gpu_mining_enabled = false;
      needsSave = true;
    }
    
    // Add gpu_workgroup_size if missing (now a configurable parameter again)
    if (!settings.gpu_workgroup_size) {
      settings.gpu_workgroup_size = 256;
      needsSave = true;
    }
    
    // Add gpu_workgroup_count if missing
    if (!settings.gpu_workgroup_count) {
      settings.gpu_workgroup_count = 4096;
      needsSave = true;
    }
    
    // Migration: Remove pool-related fields if they exist
    if ('mining_style' in settings) {
      delete settings.mining_style;
      needsSave = true;
    }
    if ('pool_url' in settings) {
      delete settings.pool_url;
      needsSave = true;
    }
    
    // Migration: Convert old contract_address to network_type
    if (settings.contract_address && !settings.network_type) {
      // Try to determine network type from contract address
      const contractsData = fs.existsSync(CONTRACTS_FILE) 
        ? JSON.parse(fs.readFileSync(CONTRACTS_FILE, 'utf-8'))
        : null;
      
      if (contractsData) {
        if (contractsData.mainnet?.address === settings.contract_address) {
          settings.network_type = 'mainnet';
        } else if (contractsData.testnet?.address === settings.contract_address) {
          settings.network_type = 'testnet';
        } else {
          // Default to mainnet if address doesn't match
          settings.network_type = 'mainnet';
        }
      } else {
        // Default to mainnet if contracts.json doesn't exist
        settings.network_type = 'mainnet';
      }
      
      // Remove old contract_address field
      delete settings.contract_address;
      needsSave = true;
      console.log('Migrated settings: converted contract_address to network_type');
    }
    
    // Save if any migrations were applied
    if (needsSave) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
      console.log('Settings migrated and saved');
    }
    
    return settings;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error(`Failed to read settings: ${error.message}`);
    console.error(`Settings file path: ${SETTINGS_FILE}`);
    return null;
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
ipcMain.handle('write-settings', (_event: Electron.IpcMainInvokeEvent, settings: any) => {
  try {
    // Ensure paths are initialized
    if (!CONFIG_DIR) {
      initConfigPaths();
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    console.log(`Settings written to: ${SETTINGS_FILE}`);
    return true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error(`Failed to write settings: ${error.message}`);
    console.error(`Settings file path: ${SETTINGS_FILE}`);
    return false;
  }
});

ipcMain.handle('read-chains', () => {
  try {
    // Ensure paths are initialized
    if (!CONFIG_DIR) {
      initConfigPaths();
    }
    // Initialize default chains if file doesn't exist
    if (!fs.existsSync(CHAINS_FILE)) {
      initConfigFiles();
    }
    const data = fs.readFileSync(CHAINS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to read chains: ${error}`);
    return null;
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
ipcMain.handle('write-chains', (_event: Electron.IpcMainInvokeEvent, chains: any) => {
  try {
    // Ensure paths are initialized
    if (!CONFIG_DIR) {
      initConfigPaths();
    }
    fs.writeFileSync(CHAINS_FILE, JSON.stringify(chains, null, 2), 'utf-8');
    return true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error(`Failed to write chains: ${error.message}`);
    return false;
  }
});

ipcMain.handle('read-rpcs', () => {
  try {
    // Ensure paths are initialized
    if (!CONFIG_DIR) {
      initConfigPaths();
    }
    // Initialize default RPCs if file doesn't exist
    if (!fs.existsSync(RPCS_FILE)) {
      initConfigFiles();
    }
    const data = fs.readFileSync(RPCS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to read RPCs: ${error}`);
    return null;
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
ipcMain.handle('write-rpcs', (_event: Electron.IpcMainInvokeEvent, rpcs: any) => {
  try {
    // Ensure paths are initialized
    if (!CONFIG_DIR) {
      initConfigPaths();
    }
    fs.writeFileSync(RPCS_FILE, JSON.stringify(rpcs, null, 2), 'utf-8');
    return true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error(`Failed to write RPCs: ${error.message}`);
    return false;
  }
});

ipcMain.handle('read-contracts', () => {
  try {
    // Ensure paths are initialized
    if (!CONFIG_DIR) {
      initConfigPaths();
    }
    if (!fs.existsSync(CONTRACTS_FILE)) {
      console.log(`Contracts file not found at: ${CONTRACTS_FILE}`);
      return null;
    }
    const data = fs.readFileSync(CONTRACTS_FILE, 'utf-8');
    return JSON.parse(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error(`Failed to read contracts: ${error.message}`);
    console.error(`Contracts file path: ${CONTRACTS_FILE}`);
    return null;
  }
});

ipcMain.handle('open-external', (_event: Electron.IpcMainInvokeEvent, url: string) => {
  try {
    shell.openExternal(url);
    return true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error(`Failed to open external URL: ${error.message}`);
    return false;
  }
});


import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

// Use project root directory for config files
// __dirname points to dist-electron in production, or electron/ in dev (after compilation)
// We need to go up to the project root
const PROJECT_ROOT = path.join(__dirname, '..');
const SETTINGS_FILE = path.join(PROJECT_ROOT, 'settings.json');
const CHAINS_FILE = path.join(PROJECT_ROOT, 'chains.json');
const RPCS_FILE = path.join(PROJECT_ROOT, 'rpcs.json');
const CONTRACTS_FILE = path.join(PROJECT_ROOT, 'contracts.json');

// Log file paths for debugging
console.log('Project root:', PROJECT_ROOT);
console.log('Settings file:', SETTINGS_FILE);
console.log('Chains file:', CHAINS_FILE);
console.log('RPCs file:', RPCS_FILE);

// Ensure project root directory exists
if (!fs.existsSync(PROJECT_ROOT)) {
  fs.mkdirSync(PROJECT_ROOT, { recursive: true });
}

// Initialize default config files if they don't exist
function initConfigFiles() {
  const defaultSettings = {
    mining_account_public_address: '0xYourMiningAddressHere',
    mining_account_private_key: '0xYourPrivateKeyHere',
    network_type: 'mainnet',
    gas_price_gwei: 1,
    priority_gas_fee_gwei: 1,
    gas_limit: 200000,
    cpu_thread_count: 1,
    rpc_rate_limit_ms: 200,
    rpc_switch_delay_seconds: 20,
    selected_chain_id: '8453',
  };

  const defaultChains = {
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
    '57073': {
      name: 'Ink',
      chainId: 57073,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    },
    '130': {
      name: 'Unichain',
      chainId: 130,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    },
    '480': {
      name: 'World Chain',
      chainId: 480,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    },
    '1868': {
      name: 'Soneium',
      chainId: 1868,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    },
    // Testnets
    '11155111': {
      name: 'Sepolia',
      chainId: 11155111,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    },
    '17000': {
      name: 'Holesky',
      chainId: 17000,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    },
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
    '80002': {
      name: 'Polygon Amoy',
      chainId: 80002,
      nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    },
    '80001': {
      name: 'Polygon Mumbai',
      chainId: 80001,
      nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    },
    '97': {
      name: 'BNB Testnet',
      chainId: 97,
      nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    },
  };

  const defaultRpcs = {
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
    '57073': [{ url: 'https://rpc.inkchain.io', name: 'Ink Official' }],
    '130': [{ url: 'https://rpc.unichain.org', name: 'Unichain Official' }],
    '480': [{ url: 'https://rpc.worldchain.org', name: 'World Chain Official' }],
    '1868': [{ url: 'https://rpc.soneium.org', name: 'Soneium Official' }],
    // Testnets
    '11155111': [
      { url: 'https://rpc.sepolia.org', name: 'Sepolia Official' },
      { url: 'https://ethereum-sepolia-rpc.publicnode.com', name: 'PublicNode' },
      { url: 'https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161', name: 'Infura' },
      { url: 'https://sepolia.llamarpc.com', name: 'LlamaRPC' },
    ],
    '17000': [
      { url: 'https://rpc.holesky.ethpandaops.io', name: 'Holesky Official' },
      { url: 'https://ethereum-holesky-rpc.publicnode.com', name: 'PublicNode' },
    ],
    '84532': [
      { url: 'https://sepolia.base.org', name: 'Base Sepolia Official' },
      { url: 'https://base-sepolia-rpc.publicnode.com', name: 'PublicNode' },
    ],
    '421614': [
      { url: 'https://sepolia-rollup.arbitrum.io/rpc', name: 'Arbitrum Sepolia Official' },
      { url: 'https://arbitrum-sepolia-rpc.publicnode.com', name: 'PublicNode' },
    ],
    '80002': [
      { url: 'https://rpc.amoy.polygon.technology', name: 'Polygon Amoy Official' },
      { url: 'https://polygon-amoy-rpc.publicnode.com', name: 'PublicNode' },
    ],
    '80001': [
      { url: 'https://rpc-mumbai.maticvigil.com', name: 'MaticVigil' },
      { url: 'https://polygon-mumbai-rpc.publicnode.com', name: 'PublicNode' },
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
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  initConfigFiles();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('read-settings', () => {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      console.log(`Settings file not found at: ${SETTINGS_FILE}`);
      return null;
    }
    const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(data);
    
    let needsSave = false;
    
    // Migration: Add gas_limit if missing
    if (!settings.gas_limit) {
      settings.gas_limit = 200000; // Default from MVis-tokenminer
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
  } catch (error: any) {
    console.error(`Failed to read settings: ${error.message}`);
    console.error(`Settings file path: ${SETTINGS_FILE}`);
    return null;
  }
});

ipcMain.handle('write-settings', (_event: Electron.IpcMainInvokeEvent, settings: any) => {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    console.log(`Settings written to: ${SETTINGS_FILE}`);
    return true;
  } catch (error: any) {
    console.error(`Failed to write settings: ${error.message}`);
    console.error(`Settings file path: ${SETTINGS_FILE}`);
    return false;
  }
});

ipcMain.handle('read-chains', () => {
  try {
    const data = fs.readFileSync(CHAINS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
});

ipcMain.handle('write-chains', (_event: Electron.IpcMainInvokeEvent, chains: any) => {
  try {
    fs.writeFileSync(CHAINS_FILE, JSON.stringify(chains, null, 2), 'utf-8');
    return true;
  } catch (error: any) {
    console.error(`Failed to write chains: ${error.message}`);
    return false;
  }
});

ipcMain.handle('read-rpcs', () => {
  try {
    const data = fs.readFileSync(RPCS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
});

ipcMain.handle('write-rpcs', (_event: Electron.IpcMainInvokeEvent, rpcs: any) => {
  try {
    fs.writeFileSync(RPCS_FILE, JSON.stringify(rpcs, null, 2), 'utf-8');
    return true;
  } catch (error: any) {
    console.error(`Failed to write RPCs: ${error.message}`);
    return false;
  }
});

ipcMain.handle('read-contracts', () => {
  try {
    if (!fs.existsSync(CONTRACTS_FILE)) {
      console.log(`Contracts file not found at: ${CONTRACTS_FILE}`);
      return null;
    }
    const data = fs.readFileSync(CONTRACTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    console.error(`Failed to read contracts: ${error.message}`);
    console.error(`Contracts file path: ${CONTRACTS_FILE}`);
    return null;
  }
});


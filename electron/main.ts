import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Miner } from './miner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let miner: Miner | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // In development, load from Vite dev server, otherwise load from dist
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
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
  if (miner) {
    miner.stop();
    miner = null;
  }
});

// IPC Handlers
function loadJSONFile(filePath: string, defaultContent: any = {}) {
  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
    return defaultContent;
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error);
    return defaultContent;
  }
}

function saveJSONFile(filePath: string, content: any) {
  try {
    writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error);
    return false;
  }
}

ipcMain.handle('load-chains', () => {
  return loadJSONFile(path.join(__dirname, '../chains.json'));
});

ipcMain.handle('load-rpcs', () => {
  return loadJSONFile(path.join(__dirname, '../rpcs.json'));
});

ipcMain.handle('save-rpcs', (_event, rpcs: any) => {
  return saveJSONFile(path.join(__dirname, '../rpcs.json'), rpcs);
});

ipcMain.handle('load-settings', () => {
  return loadJSONFile(path.join(__dirname, '../settings.json'), {
    mining_account_public_address: '',
    mining_account_private_key: '',
    mining_style: 'solo',
    contract_address: '',
    pool_url: '',
    gas_price_gwei: 1000000000, // 1 Gwei in Wei
    priority_gas_fee_gwei: 1000000000, // 1 Gwei in Wei
    cpu_thread_count: 1,
    web3provider: '',
    rate_limiter_ms: 200,
    auto_failover_cooldown_seconds: 20,
    selected_chain: '84532',
  });
});

ipcMain.handle('save-settings', (_event, settings: any) => {
  return saveJSONFile(path.join(__dirname, '../settings.json'), settings);
});

ipcMain.handle('start-mining', (_event, settings: any) => {
  if (miner) {
    miner.stop();
  }
  
  miner = new Miner(settings, (stats) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mining-stats', stats);
    }
  });
  
  miner.start();
  return { success: true };
});

ipcMain.handle('stop-mining', () => {
  if (miner) {
    miner.stop();
    // Send final status update
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mining-stats', miner.getStats());
    }
    miner = null;
    return { success: true };
  }
  // Send stopped status even if miner wasn't running
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mining-stats', {
      isMining: false,
      hashesPerSecond: 0,
      totalHashes: 0,
      solutionsFound: 0,
      successfulMints: 0,
      failedMints: 0,
      currentChallenge: '',
      currentTarget: '0',
      currentDifficulty: '0',
      lastSolutionTime: null,
      lastMintTime: null,
      currentRpc: '',
      rpcFailures: 0,
      epoch: 0,
    });
  }
  return { success: false };
});

ipcMain.handle('get-mining-status', () => {
  if (miner) {
    return { isMining: miner.isRunning(), stats: miner.getStats() };
  }
  return { isMining: false, stats: null };
});

ipcMain.handle('clear-logs', () => {
  if (miner) {
    miner.clearLogs();
    // clearLogs already sends stats update via callback
    return { success: true };
  }
  // Even if miner isn't running, clear logs from stats if they exist
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mining-stats', {
      isMining: false,
      hashesPerSecond: 0,
      totalHashes: 0,
      solutionsFound: 0,
      successfulMints: 0,
      failedMints: 0,
      currentChallenge: '',
      currentTarget: '0',
      currentDifficulty: '0',
      lastSolutionTime: null,
      lastMintTime: null,
      currentRpc: '',
      rpcFailures: 0,
      epoch: 0,
      logs: [],
    });
  }
  return { success: true };
});


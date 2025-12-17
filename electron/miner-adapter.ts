// Adapter to bridge the mining engine (CommonJS) with our Electron app (ES modules)
// This wraps the proven mining engine with C++ native addon

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
// Use ethers v6
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Load mining engine modules (CommonJS)
const minerAccelPath = path.join(__dirname, '../miner-engine/miner-accel.js');
const networkInterfacePath = path.join(__dirname, '../miner-engine/lib/network-interface.js');
const poolInterfacePath = path.join(__dirname, '../miner-engine/lib/pool-interface.js');
const miningLoggerPath = path.join(__dirname, '../miner-engine/lib/mining-logger.js');

let MinerEngine: any = null;
let NetworkInterface: any = null;
let PoolInterface: any = null;
let MiningLogger: any = null;

try {
  MinerEngine = require(minerAccelPath);
  NetworkInterface = require(networkInterfacePath);
  PoolInterface = require(poolInterfacePath);
  MiningLogger = require(miningLoggerPath);
} catch (error: any) {
  console.error('Failed to load mining engine:', error.message);
  throw error;
}

// Use ethers v6 types
export interface MinerAdapterSettings {
  contractAddress: string;
  wallet: ethers.Wallet;
  provider: ethers.JsonRpcProvider;
  miningStyle: 'solo' | 'pool';
  poolUrl?: string;
  gasPriceGwei: number;
  priorityGasFeeGwei: number;
  statsCallback?: (stats: {
    hashesPerSecond: number;
    totalHashes: number;
    solutionsFound: number;
    successfulMints: number;
    failedMints: number;
  }) => void;
}

export class MinerAdapter {
  private settings: MinerAdapterSettings;
  private isRunning = false;
  private statsInterval: NodeJS.Timeout | null = null;

  constructor(settings: MinerAdapterSettings) {
    this.settings = settings;
  }

  async start() {
    if (this.isRunning) {
      console.warn('Mining engine adapter already running');
      return;
    }

    try {
      // Initialize mining engine components
      MiningLogger.init();
      
      NetworkInterface.init(
        ethers,
        this.settings.provider,
        this.settings.wallet,
        MiningLogger,
        this.settings.contractAddress,
        this.settings.gasPriceGwei,
        this.settings.priorityGasFeeGwei
      );

      if (this.settings.poolUrl) {
        PoolInterface.init(
          ethers,
          this.settings.provider,
          this.settings.wallet,
          MiningLogger,
          this.settings.contractAddress,
          this.settings.poolUrl
        );
      }

      MinerEngine.init(
        this.settings.contractAddress,
        ethers,
        this.settings.wallet,
        MiningLogger
      );

      MinerEngine.setNetworkInterface(NetworkInterface);
      if (this.settings.poolUrl) {
        MinerEngine.setPoolInterface(PoolInterface);
      }

      // Start mining
      await MinerEngine.mine(
        this.settings.miningStyle,
        this.settings.wallet,
        this.settings.provider,
        this.settings.poolUrl || '',
        this.settings.gasPriceGwei,
        this.settings.priorityGasFeeGwei
      );

      this.isRunning = true;

      // Update stats periodically
      if (this.settings.statsCallback) {
        this.statsInterval = setInterval(() => {
          try {
            // Get stats from mining engine (if available)
            const stats = {
              hashesPerSecond: 0,
              totalHashes: 0,
              solutionsFound: 0,
              successfulMints: 0,
              failedMints: 0,
            };
            this.settings.statsCallback?.(stats);
          } catch (error) {
            console.error('Error updating stats:', error);
          }
        }, 1000);
      }

      console.log('Mining engine started successfully');
    } catch (error: any) {
      console.error('Failed to start mining engine:', error);
      throw error;
    }
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      // Stop mining engine
      if (MinerEngine && typeof MinerEngine.stop === 'function') {
        MinerEngine.stop();
      }

      if (this.statsInterval) {
        clearInterval(this.statsInterval);
        this.statsInterval = null;
      }

      this.isRunning = false;
      console.log('Mining engine stopped');
    } catch (error: any) {
      console.error('Error stopping mining engine:', error);
    }
  }

  isMining(): boolean {
    return this.isRunning;
  }
}


import { ethers } from 'ethers';
import { keccak256, solidityPacked } from 'ethers';
import * as path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { MinerAdapter } from './miner-adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MinerSettings {
  mining_account_public_address: string;
  mining_account_private_key: string;
  mining_style: 'solo' | 'pool';
  contract_address: string;
  pool_url?: string;
  gas_price_gwei: number;
  priority_gas_fee_gwei: number;
  cpu_thread_count: number;
  web3provider: string;
  rate_limiter_ms: number;
  auto_failover_cooldown_seconds: number;
  selected_chain: string;
}

export interface MiningStats {
  hashesPerSecond: number;
  totalHashes: number;
  solutionsFound: number;
  successfulMints: number;
  failedMints: number;
  currentChallenge: string;
  currentTarget: string;
  currentDifficulty: string;
  lastSolutionTime: number | null;
  lastMintTime: number | null;
  isMining: boolean;
  currentRpc: string;
  rpcFailures: number;
  epoch: number;
  logs: Array<{ timestamp: number; level: string; message: string }>;
}

export class Miner {
  private settings: MinerSettings;
  private provider: ethers.JsonRpcProvider | null = null;
  private contract: ethers.Contract | null = null;
  private wallet: ethers.Wallet | null = null;
  private isRunningFlag = false;
  private stats: MiningStats;
  private statsCallback: (stats: MiningStats) => void;
  private lastRpcCallTime = 0;
  private rpcIndex = 0;
  private rpcFailures = 0;
  private lastFailoverTime = 0;
  private rpcs: string[] = [];
  private isSubmitting = false; // Prevent concurrent submissions
  private solutionQueue: Array<{ nonce: bigint; digest: string; challenge: string }> = []; // Queue solutions if busy
  private minerAdapter: MinerAdapter | null = null; // Mining engine adapter

  private logs: Array<{ timestamp: number; level: string; message: string }> = [];
  private readonly MAX_LOGS = 1000;

  constructor(settings: MinerSettings, statsCallback: (stats: MiningStats) => void) {
    this.settings = settings;
    this.statsCallback = statsCallback;
    this.stats = {
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
      isMining: false,
      currentRpc: '',
      rpcFailures: 0,
      epoch: 0,
      logs: [],
    };
  }

  private log(message: string, level: string = 'info') {
    const logEntry = {
      timestamp: Date.now(),
      level,
      message,
    };
    this.logs.push(logEntry);
    // Keep only last MAX_LOGS entries
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.shift();
    }
    // Update stats with logs
    this.stats.logs = [...this.logs];
    console.log(`[${level.toUpperCase()}] ${message}`);
  }

  async initializeProvider() {
    // Load RPCs for the selected chain
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    const rpcsPath = path.join(__dirname, '../rpcs.json');
    const rpcsData = JSON.parse(fs.readFileSync(rpcsPath, 'utf-8'));
    this.rpcs = rpcsData[this.settings.selected_chain] || [];
    
    if (this.rpcs.length === 0) {
      // Fallback to web3provider if no RPCs configured
      if (this.settings.web3provider) {
        this.rpcs = [this.settings.web3provider];
      } else {
        throw new Error(`No RPCs configured for chain ${this.settings.selected_chain}`);
      }
    }

    // Try to connect to an RPC
    await this.connectToRpc();
  }

  async connectToRpc(): Promise<boolean> {
    if (this.rpcIndex >= this.rpcs.length) {
      this.rpcIndex = 0;
    }

    const rpcUrl = this.rpcs[this.rpcIndex];
    this.stats.currentRpc = rpcUrl;

    try {
      // Use ethers v6 API
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      await this.provider.getBlockNumber(); // Test connection
      
      this.wallet = new ethers.Wallet(this.settings.mining_account_private_key, this.provider);
      
      // Load contract ABI from abi.json file
      const abiPath = path.join(__dirname, '..', 'abi.json');
      const abiContent = fs.readFileSync(abiPath, 'utf-8');
      const contractABI = JSON.parse(abiContent);
      
      this.contract = new ethers.Contract(
        this.settings.contract_address,
        contractABI,
        this.wallet
      );

      this.rpcFailures = 0;
      return true;
    } catch (error) {
      console.error(`Failed to connect to RPC ${rpcUrl}:`, error);
      this.rpcFailures++;
      this.rpcIndex++;
      
      // Auto-failover after cooldown
      const now = Date.now();
      if (now - this.lastFailoverTime >= this.settings.auto_failover_cooldown_seconds * 1000) {
        this.lastFailoverTime = now;
        if (this.rpcIndex < this.rpcs.length) {
          return this.connectToRpc();
        }
      }
      
      throw error;
    }
  }

  async updateContractState() {
    if (!this.contract || !this.provider) return;

    try {
      // Rate limiting
      const now = Date.now();
      if (this.settings.rate_limiter_ms > 0) {
        const timeSinceLastCall = now - this.lastRpcCallTime;
        if (timeSinceLastCall < this.settings.rate_limiter_ms) {
          await new Promise(resolve => setTimeout(resolve, this.settings.rate_limiter_ms - timeSinceLastCall));
        }
      }
      this.lastRpcCallTime = Date.now();

      const [challenge, target, difficulty, epoch] = await Promise.all([
        this.contract.getChallengeNumber(),
        this.contract.getMiningTarget(),
        this.contract.getMiningDifficulty(),
        this.contract.epochCount(),
      ]);

      // Use target directly from contract
      const targetBigInt = BigInt(target.toString());
      
      this.stats.currentChallenge = challenge;
      this.stats.currentTarget = targetBigInt.toString();
      this.stats.currentDifficulty = difficulty.toString();
      this.stats.epoch = Number(epoch);
      
      // Log the update
      this.log(`Contract state updated: challenge=${challenge.substring(0, 20)}..., target=${targetBigInt.toString()}, difficulty=${difficulty.toString()}, epoch=${epoch}`, 'info');
    } catch (error) {
      console.error('Error updating contract state:', error);
      // Try to failover
      await this.connectToRpc();
    }
  }

  private async processSolutionQueue() {
    if (this.isSubmitting || this.solutionQueue.length === 0) return;
    
    this.isSubmitting = true;
    try {
      while (this.solutionQueue.length > 0) {
        const solution = this.solutionQueue.shift();
        if (!solution) break;
        
        this.log(`Processing queued solution: nonce=${solution.nonce.toString()}`, 'info');
        await this.submitSolution(solution.nonce, solution.digest, solution.challenge);
        
        // Update challenge after submission
        await this.updateContractState();
        
        // Small delay between submissions to prevent overwhelming the RPC
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } finally {
      this.isSubmitting = false;
    }
  }

  async submitSolution(nonce: bigint, digest?: string, challengeUsed?: string) {
    if (!this.contract || !this.wallet) return false;

    // CRITICAL: Use wallet.address (msg.sender) - they must match for contract validation!
    const walletAddress = this.wallet.address.toLowerCase();
    
    // Update challenge state to get current target
    await this.updateContractState();
    
    // If digest was provided (from worker), use it - it was calculated with the challenge at solution time
    // Only recalculate if digest wasn't provided
    if (!digest) {
      // Recalculate digest with CURRENT challenge and wallet address
      // Use solidityPacked to match contract's abi.encodePacked exactly
      const challengeHex = this.stats.currentChallenge.startsWith('0x') 
        ? this.stats.currentChallenge.slice(2) 
        : this.stats.currentChallenge;
      const challengeBytes32 = '0x' + challengeHex;
      const addressHex = walletAddress.startsWith('0x') 
        ? walletAddress.slice(2) 
        : walletAddress;
      const address = '0x' + addressHex;
      
      const packed = solidityPacked(
        ['bytes32', 'address', 'uint256'],
        [challengeBytes32, address, nonce]
      );
      digest = keccak256(packed);
      this.log(`Recalculated digest with current challenge: ${digest}`, 'info');
    } else {
      this.log(`Using provided digest from worker: ${digest}`, 'info');
      if (challengeUsed) {
        this.log(`Solution was found with challenge: ${challengeUsed.substring(0, 20)}...`, 'info');
      }
    }
    
    // Verify the digest meets the target (use current target for validation)
    const solutionHashBigInt = BigInt(digest);
    const targetBigInt = BigInt(this.stats.currentTarget);
    
    this.log(`Solution validation: digest=${digest}, target=${this.stats.currentTarget}, valid=${solutionHashBigInt <= targetBigInt}`, 'info');
    
    // Verify solution meets target
    if (solutionHashBigInt > targetBigInt) {
      this.log(`ERROR: Solution digest ${digest} exceeds target ${this.stats.currentTarget} - challenge may have changed since solution was found!`, 'error');
      throw new Error(`Solution invalid with current target. Digest: ${digest}, Target: ${this.stats.currentTarget}`);
    }
    
    // Validate nonce is not zero (though technically valid, it's suspicious)
    if (nonce === BigInt(0)) {
      this.log(`WARNING: Submitting solution with nonce 0 - this is unusual`, 'warning');
    }
    
    // Verify wallet address matches what we're using for hash calculation
    if (this.settings.mining_account_public_address.toLowerCase() !== walletAddress) {
      this.log(`WARNING: Settings address (${this.settings.mining_account_public_address}) does not match wallet address (${walletAddress}). Using wallet address for hash calculation.`, 'warning');
    }
    
    this.log(`Submitting solution with nonce: ${nonce.toString()}, digest: ${digest}, wallet: ${walletAddress}`, 'info');
    
    try {
      // Rate limiting
      const now = Date.now();
      if (this.settings.rate_limiter_ms > 0) {
        const timeSinceLastCall = now - this.lastRpcCallTime;
        if (timeSinceLastCall < this.settings.rate_limiter_ms) {
          await new Promise(resolve => setTimeout(resolve, this.settings.rate_limiter_ms - timeSinceLastCall));
        }
      }
      this.lastRpcCallTime = Date.now();

      // Gas price for ethers v6 (convert Gwei to Wei)
      const gasPrice = ethers.parseUnits(
        (this.settings.gas_price_gwei || 50000000000).toString(),
        'gwei'
      );

      // ERIS contract uses mint(uint256, bytes32) - the digest parameter is required
      // Based on the ABI, the function signature is: mint(uint256 nonce, bytes32)
      let receipt: ethers.ContractTransactionReceipt | null = null;
      
      try {
        // Use the mint function with both parameters (nonce and digest)
        // The ABI defines: mint(uint256 nonce, bytes32)
        const digestParam = digest || '0x0000000000000000000000000000000000000000000000000000000000000000';
        this.log(`Calling mint(uint256,bytes32) with nonce: ${nonce.toString()}, digest: ${digestParam}`, 'info');
        
        // Verify contract exists
        if (!this.contract) {
          throw new Error('Contract not initialized');
        }
        
        // Optional: Try a static call to simulate the transaction and get revert reason (for debugging)
        // Don't block submission if it fails - just log a warning
        try {
          // Use staticCall for ethers v6 (simulates transaction without sending)
          const result = await this.contract.mint.staticCall(nonce, digestParam);
          this.log(`Static call succeeded: ${result}`, 'debug');
        } catch (staticError: any) {
          // Static call failed - log warning but don't block submission
          let staticErrorMsg = staticError.message || String(staticError);
          if (staticError.reason) {
            staticErrorMsg = `Revert reason: ${staticError.reason}`;
          } else if (staticError.data) {
            // Try to decode the error data
            try {
              const errorFragment = this.contract.interface.parseError(staticError.data);
              if (errorFragment) {
                staticErrorMsg = `Contract error: ${errorFragment.name}(${errorFragment.args})`;
              } else {
                staticErrorMsg = `Error data: ${staticError.data}`;
              }
            } catch {
              staticErrorMsg = `Error data: ${staticError.data}`;
            }
          }
          this.log(`Warning: Static call suggests transaction may revert: ${staticErrorMsg}`, 'warning');
          // Continue anyway - let the actual transaction determine success/failure
        }
        
        // Call mint directly through the contract - this ensures proper encoding
        // The contract will verify the solution internally
        // Use maxFeePerGas and maxPriorityFeePerGas for EIP-1559 (ethers v6)
        const maxFeePerGas = ethers.parseUnits(
          (this.settings.gas_price_gwei || 50000000000).toString(),
          'gwei'
        );
        const maxPriorityFeePerGas = ethers.parseUnits(
          (this.settings.priority_gas_fee_gwei || 1000000000).toString(),
          'gwei'
        );
        
        const tx = await this.contract.mint(nonce, digestParam, {
          gasLimit: 100000,
          maxFeePerGas: maxFeePerGas,
          maxPriorityFeePerGas: maxPriorityFeePerGas,
        });
        
        // Log transaction details for debugging - compare with working miner format
        this.log(`Transaction sent: hash=${tx.hash}`, 'info');
        this.log(`Transaction data (first 100 chars): ${tx.data?.substring(0, 100)}...`, 'info');
        this.log(`Full transaction data: ${tx.data}`, 'debug');
        this.log(`Nonce (hex): 0x${nonce.toString(16).padStart(64, '0')}`, 'debug');
        this.log(`Digest (hex): ${digestParam}`, 'debug');
        
        // Wait for transaction with error handling
        try {
          receipt = await tx.wait() as ethers.ContractTransactionReceipt;
        } catch (waitError: any) {
          // Try to get more details about the revert
          if (waitError.receipt) {
            this.log(`Transaction reverted. Receipt status: ${waitError.receipt.status}, Gas used: ${waitError.receipt.gasUsed}`, 'error');
            
            // Try to estimate gas to see what the revert reason might be
            try {
              const result = await this.contract.mint.staticCall(nonce, digestParam);
              this.log(`Static call succeeded: ${result}`, 'debug');
            } catch (staticError: any) {
              this.log(`Gas estimation failed: ${staticError.message}`, 'error');
              if (staticError.reason) {
                this.log(`Revert reason: ${staticError.reason}`, 'error');
              }
            }
          }
          throw waitError;
        }
      } catch (error: any) {
        // Extract revert reason if available
        let errorMessage = error.message || String(error);
        if (error.reason) {
          errorMessage = `Revert reason: ${error.reason}`;
        } else if (error.data) {
          errorMessage = `Error data: ${error.data}`;
        } else if (error.transaction?.data) {
          errorMessage = `Transaction data: ${error.transaction.data}`;
        }
        this.log(`Mint failed: ${errorMessage}`, 'error');
        throw error;
      }

      if (receipt && receipt.status === 1) {
        this.stats.successfulMints++;
        this.stats.lastMintTime = Date.now();
        this.log(`Mint successful! Transaction: ${receipt.hash}`, 'success');
        return true;
      }
      this.log(`Mint transaction failed: receipt status ${receipt?.status}`, 'error');
      return false;
    } catch (error: any) {
      // Extract revert reason if available
      let errorMessage = error.message || String(error);
      if (error.reason) {
        errorMessage = `Revert reason: ${error.reason}`;
      } else if (error.data) {
        errorMessage = `Error data: ${error.data}`;
      }
      
      this.log(`Error submitting solution: ${errorMessage}`, 'error');
      console.error('Error submitting solution:', error);
      this.stats.failedMints++;
      
      // If it's an RPC error, try failover
      if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
        await this.connectToRpc();
      }
      
      return false;
    }
  }

  async start() {
    if (this.isRunningFlag) return;

    this.log('Starting miner...', 'info');
    try {
      await this.initializeProvider();
      this.log(`Connected to RPC: ${this.stats.currentRpc}`, 'info');
      await this.updateContractState();
      this.log(`Challenge: ${this.stats.currentChallenge.substring(0, 20)}..., Target: ${this.stats.currentTarget}, Difficulty: ${this.stats.currentDifficulty}`, 'info');
    } catch (error: any) {
      this.log(`Failed to initialize miner: ${error.message}`, 'error');
      console.error('Failed to initialize miner:', error);
      return;
    }

    this.isRunningFlag = true;
    this.stats.isMining = true;

    // Use mining engine (proven, fast, with C++ native addon)
    this.log('Starting mining engine...', 'info');
    
    if (!this.provider || !this.wallet) {
      this.log('ERROR: Provider or wallet not initialized', 'error');
      return;
    }

    try {
      // Create mining engine adapter (uses ethers v6)
      this.minerAdapter = new MinerAdapter({
        contractAddress: this.settings.contract_address,
        wallet: this.wallet,
        provider: this.provider,
        miningStyle: this.settings.mining_style,
        poolUrl: this.settings.pool_url,
        gasPriceGwei: this.settings.gas_price_gwei,
        priorityGasFeeGwei: this.settings.priority_gas_fee_gwei,
        statsCallback: (stats) => {
          // Update our stats from mining engine
          this.stats.hashesPerSecond = stats.hashesPerSecond;
          this.stats.totalHashes = stats.totalHashes;
          this.stats.solutionsFound = stats.solutionsFound;
          this.stats.successfulMints = stats.successfulMints;
          this.stats.failedMints = stats.failedMints;
        },
      });

      await this.minerAdapter.start();
      this.log('Mining engine started successfully', 'info');
    } catch (error: any) {
      this.log(`Failed to start mining engine: ${error.message}`, 'error');
      console.error('Mining engine startup error:', error);
      this.isRunningFlag = false;
      this.stats.isMining = false;
      return;
    }

    // Update contract state periodically
    const updateInterval = setInterval(async () => {
      if (this.isRunningFlag) {
        await this.updateContractState();
      } else {
        clearInterval(updateInterval);
      }
    }, 30000); // Update every 30 seconds

    // Update stats periodically
    const statsInterval = setInterval(() => {
      if (this.isRunningFlag) {
        // Update logs in stats before sending
        this.stats.logs = [...this.logs];
        this.statsCallback(this.stats);
      } else {
        clearInterval(statsInterval);
      }
    }, 1000); // Update every second
  }

  stop() {
    this.isRunningFlag = false;
    this.stats.isMining = false;
    
    if (this.minerAdapter) {
      this.log('Stopping mining engine', 'info');
      this.minerAdapter.stop();
      this.minerAdapter = null;
    }
    
    this.solutionQueue = []; // Clear solution queue
    this.isSubmitting = false;
    
    // Send final stats update to notify GUI that mining has stopped
    this.statsCallback(this.stats);
  }

  isRunning(): boolean {
    return this.isRunningFlag;
  }

  getStats(): MiningStats {
    return { ...this.stats };
  }

  clearLogs() {
    this.logs = [];
    this.stats.logs = [];
    // Immediately update stats to reflect cleared logs
    this.statsCallback({ ...this.stats, logs: [] });
  }
}


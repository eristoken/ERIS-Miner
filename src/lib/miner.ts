import { ethers } from 'ethers';
import { RpcManager } from './rpcManager';
import { Settings, MiningStats, RpcEndpoint, LogEntry } from '../types';
import { addLog } from '../pages/Console';

// ERC918 ABI - minimal interface for mining
const ERC918_ABI = [
  'function mint(uint256 nonce, bytes32 challenge_digest) external returns (bool)',
  'function getChallengeNumber() external view returns (bytes32)',
  'function getMiningDifficulty() external view returns (uint256)',
  'function getMiningTarget() external view returns (uint256)',
  'function getMiningReward() external view returns (uint256)',
  'event Mint(address indexed from, uint256 rewardAmount, uint256 epochCount, bytes32 newChallengeNumber)',
];

export class Miner {
  private rpcManager: RpcManager;
  private settings: Settings;
  private isMining: boolean = false;
  private isSubmitting: boolean = false;
  private stats: MiningStats;
  private workers: Worker[] = [];
  private contract: ethers.Contract | null = null;
  private wallet: ethers.Wallet | null = null;
  private provider: ethers.JsonRpcProvider | null = null;
  private onStatsUpdate?: (stats: MiningStats) => void;
  private onLog?: (log: LogEntry) => void;
  private startTime: number = 0;
  private totalHashes: number = 0;
  private solutionsFound: number = 0;
  private tokensMinted: number = 0;

  constructor(rpcManager: RpcManager) {
    this.rpcManager = rpcManager;
    this.stats = {
      hashesPerSecond: 0,
      totalHashes: 0,
      solutionsFound: 0,
      tokensMinted: 0,
      currentChallenge: '0x',
      currentDifficulty: '0',
      currentReward: '0',
      isMining: false,
    };
  }

  setOnStatsUpdate(callback: (stats: MiningStats) => void) {
    this.onStatsUpdate = callback;
  }

  setOnLog(callback: (log: LogEntry) => void) {
    this.onLog = callback;
  }

  private log(level: LogEntry['level'], message: string) {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
    };
    
    // Add to global console
    addLog(logEntry);
    
    // Also call callback if set
    if (this.onLog) {
      this.onLog(logEntry);
    }
  }

  async updateSettings(settings: Settings, rpcs: Record<string, RpcEndpoint[]>) {
    this.settings = settings;
    this.rpcManager.setRateLimit(settings.rpc_rate_limit_ms);
    this.rpcManager.setSwitchDelay(settings.rpc_switch_delay_seconds * 1000);

    const chainRpcs = rpcs[settings.selected_chain_id] || [];
    if (chainRpcs.length > 0) {
      await this.rpcManager.initializeRpcs(settings.selected_chain_id, chainRpcs);
    }
  }

  async initialize() {
    try {
      const chainRpcs = await window.electronAPI.readRpcs();
      if (!chainRpcs || !chainRpcs[this.settings.selected_chain_id]) {
        throw new Error(`No RPCs configured for chain ${this.settings.selected_chain_id}`);
      }

      await this.rpcManager.initializeRpcs(
        this.settings.selected_chain_id,
        chainRpcs[this.settings.selected_chain_id]
      );

      this.provider = await this.rpcManager.getProvider(
        this.settings.selected_chain_id,
        chainRpcs[this.settings.selected_chain_id]
      );

      this.wallet = new ethers.Wallet(this.settings.mining_account_private_key, this.provider);
      this.contract = new ethers.Contract(
        this.settings.contract_address,
        ERC918_ABI,
        this.wallet
      );

      this.log('success', 'Miner initialized successfully');
    } catch (error: any) {
      this.log('error', `Failed to initialize miner: ${error.message}`);
      throw error;
    }
  }

  private async fetchContractData(): Promise<{
    challenge: string;
    difficulty: string;
    reward: string;
  }> {
    if (!this.contract || !this.provider) {
      throw new Error('Contract not initialized');
    }

    try {
      const chainRpcs = await window.electronAPI.readRpcs();
      if (!chainRpcs || !chainRpcs[this.settings.selected_chain_id]) {
        throw new Error('RPCs not configured');
      }

      // Try to get provider, switch if rate limited
      let provider = this.provider;
      try {
        provider = await this.rpcManager.getProvider(
          this.settings.selected_chain_id,
          chainRpcs[this.settings.selected_chain_id]
        );
      } catch (error) {
        // Rate limited, switch RPC
        if (this.settings.mining_style === 'solo') {
          await this.rpcManager.switchToNextRpc(
            this.settings.selected_chain_id,
            chainRpcs[this.settings.selected_chain_id]
          );
          provider = await this.rpcManager.getProvider(
            this.settings.selected_chain_id,
            chainRpcs[this.settings.selected_chain_id]
          );
        }
      }

      const contractWithNewProvider = new ethers.Contract(
        this.settings.contract_address,
        ERC918_ABI,
        provider
      );

      const [challenge, difficulty, target, reward] = await Promise.all([
        contractWithNewProvider.getChallengeNumber(),
        contractWithNewProvider.getMiningDifficulty(),
        contractWithNewProvider.getMiningTarget(),
        contractWithNewProvider.getMiningReward(),
      ]);

      return {
        challenge: challenge,
        difficulty: difficulty.toString(),
        reward: ethers.formatEther(reward),
      };
    } catch (error: any) {
      this.log('error', `Failed to fetch contract data: ${error.message}`);
      throw error;
    }
  }

  private hash(challenge: string, address: string, nonce: bigint): bigint {
    // Match FTIC-Miner's exact method: web3utils.sha3(challenge_number + hashingEthAddress.substring(2) + solution_number.substring(2))
    // challenge_number keeps its 0x prefix, address and nonce have 0x removed
    const addressHex = address.startsWith('0x') ? address.substring(2) : address;
    const nonceHex = nonce.toString(16).padStart(64, '0'); // uint256 = 64 hex chars (32 bytes)
    
    // Concatenate: challenge (with 0x) + address (no 0x) + nonce (no 0x)
    // This matches FTIC-Miner: challenge_number already has 0x, we just append the rest
    const concatenated = challenge + addressHex + nonceHex;
    const hash = ethers.keccak256(concatenated);
    return BigInt(hash);
  }

  private async submitSolution(nonce: bigint, challenge: string): Promise<boolean> {
    if (!this.contract || !this.wallet) {
      return false;
    }

    try {
      const chainRpcs = await window.electronAPI.readRpcs();
      if (!chainRpcs || !chainRpcs[this.settings.selected_chain_id]) {
        return false;
      }

      let provider = this.provider;
      try {
        provider = await this.rpcManager.getProvider(
          this.settings.selected_chain_id,
          chainRpcs[this.settings.selected_chain_id]
        );
      } catch (error) {
        if (this.settings.mining_style === 'solo') {
          await this.rpcManager.switchToNextRpc(
            this.settings.selected_chain_id,
            chainRpcs[this.settings.selected_chain_id]
          );
          provider = await this.rpcManager.getProvider(
            this.settings.selected_chain_id,
            chainRpcs[this.settings.selected_chain_id]
          );
        }
      }

      const walletWithProvider = new ethers.Wallet(this.settings.mining_account_private_key, provider);
      const contractWithProvider = new ethers.Contract(
        this.settings.contract_address,
        ERC918_ABI,
        walletWithProvider
      );

      // Calculate challenge_digest for backwards compatibility
      const challengeDigest = ethers.keccak256(
        ethers.solidityPacked(
          ['bytes32', 'address', 'uint256'],
          [challenge, this.settings.mining_account_public_address, nonce]
        )
      );

      // Use EIP-1559 transaction format
      // maxFeePerGas = total maximum fee (gasPrice setting)
      // maxPriorityFeePerGas = tip to miner (priority fee setting)
      const maxFeePerGas = ethers.parseUnits(
        this.settings.gas_price_gwei.toString(),
        'gwei'
      );
      const maxPriorityFeePerGas = ethers.parseUnits(
        this.settings.priority_gas_fee_gwei.toString(),
        'gwei'
      );

      const tx = await contractWithProvider.mint(nonce, challengeDigest, {
        maxFeePerGas,
        maxPriorityFeePerGas,
        gasLimit: 100000,
      });

      this.log('info', `Transaction submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      this.log('success', `Solution confirmed! Block: ${receipt.blockNumber}`);

      // Parse Mint event to get reward amount
      const mintEvent = receipt.logs.find((log: any) => {
        try {
          const parsed = contractWithProvider.interface.parseLog(log);
          return parsed && parsed.name === 'Mint';
        } catch {
          return false;
        }
      });

      if (mintEvent) {
        const parsed = contractWithProvider.interface.parseLog(mintEvent);
        if (parsed) {
          const rewardAmount = parsed.args.rewardAmount;
          this.tokensMinted += Number(ethers.formatEther(rewardAmount));
          this.solutionsFound++;
        }
      }

      return true;
    } catch (error: any) {
      this.log('error', `Failed to submit solution: ${error.message}`);
      return false;
    }
  }

  private createWorker(): Worker {
    // Create a web worker for mining
    const workerCode = `
      self.onmessage = function(e) {
        const { challenge, address, startNonce, endNonce, target } = e.data;
        
        // Simple keccak256 implementation for worker
        function keccak256(data) {
          // This is a placeholder - in production, use a proper keccak256 library
          // For now, we'll use a simple hash function
          return BigInt('0x' + data);
        }
        
        function hash(challenge, address, nonce) {
          // Pack: bytes32 + address + uint256
          const packed = challenge + address.slice(2) + nonce.toString(16).padStart(64, '0');
          const hashHex = keccak256(packed);
          return hashHex;
        }
        
        for (let nonce = BigInt(startNonce); nonce <= BigInt(endNonce); nonce++) {
          const hashValue = hash(challenge, address, nonce);
          if (hashValue <= BigInt(target)) {
            self.postMessage({ found: true, nonce: nonce.toString() });
            return;
          }
        }
        
        self.postMessage({ found: false });
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
  }

  async start() {
    if (this.isMining) {
      return;
    }

    try {
      await this.initialize();
      this.isMining = true;
      this.startTime = Date.now();
      this.totalHashes = 0;
      this.solutionsFound = 0;
      this.tokensMinted = 0;
      this.stats.isMining = true;

      // Reset displayed stats when starting
      this.stats.hashesPerSecond = 0;
      this.stats.totalHashes = 0;
      this.stats.solutionsFound = 0;
      this.stats.tokensMinted = 0;
      if (this.onStatsUpdate) {
        this.onStatsUpdate({ ...this.stats });
      }

      this.log('success', 'Mining started');

      // Start mining loop
      this.mine();
    } catch (error: any) {
      this.log('error', `Failed to start mining: ${error.message}`);
      this.isMining = false;
      this.stats.isMining = false;
    }
  }

  stop() {
    this.isMining = false;
    this.isSubmitting = false; // Clear submission flag when stopping
    this.stats.isMining = false;
    // Reset stats when stopping so UI toggles off cleanly
    this.startTime = 0;
    this.totalHashes = 0;
    this.solutionsFound = 0;
    this.tokensMinted = 0;
    this.stats.hashesPerSecond = 0;
    this.stats.totalHashes = 0;
    this.stats.solutionsFound = 0;
    this.stats.tokensMinted = 0;
    if (this.onStatsUpdate) {
      this.onStatsUpdate({ ...this.stats });
    }
    this.workers.forEach((worker) => worker.terminate());
    this.workers = [];
    this.log('info', 'Mining stopped');
  }

  private async mine() {
    while (this.isMining) {
      try {
        // Yield to event loop before starting to prevent blocking
        await new Promise((resolve) => setTimeout(resolve, 0));
        
        // Fetch current contract state
        const { challenge, difficulty, reward } = await this.fetchContractData();
        this.stats.currentChallenge = challenge;
        this.stats.currentDifficulty = difficulty;
        this.stats.currentReward = reward;

        // Get mining target
        if (!this.contract || !this.provider) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        const chainRpcs = await window.electronAPI.readRpcs();
        if (!chainRpcs || !chainRpcs[this.settings.selected_chain_id]) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        let provider = this.provider;
        try {
          provider = await this.rpcManager.getProvider(
            this.settings.selected_chain_id,
            chainRpcs[this.settings.selected_chain_id]
          );
        } catch (error) {
          if (this.settings.mining_style === 'solo') {
            await this.rpcManager.switchToNextRpc(
              this.settings.selected_chain_id,
              chainRpcs[this.settings.selected_chain_id]
            );
            provider = await this.rpcManager.getProvider(
              this.settings.selected_chain_id,
              chainRpcs[this.settings.selected_chain_id]
            );
          }
        }

        const contractWithProvider = new ethers.Contract(
          this.settings.contract_address,
          ERC918_ABI,
          provider
        );

        const target = await contractWithProvider.getMiningTarget();

        // Mine with multiple threads using random nonce generation (like FTIC-Miner)
        const threads = this.settings.cpu_thread_count;
        const promises: Promise<void>[] = [];

        // Reset submission flag before starting new mining round
        this.isSubmitting = false;

        // Each thread will generate random nonces independently (like FTIC-Miner)
        for (let i = 0; i < threads; i++) {
          promises.push(
            this.mineRandom(challenge, this.settings.mining_account_public_address, BigInt(target.toString()))
          );
        }

        // Wait for any thread to find a solution
        await Promise.race(promises);
        
        // If a solution was found and is being submitted, wait for submission to complete
        if (this.isSubmitting) {
          this.log('info', 'Waiting for solution submission to complete...');
          // Wait until submission is complete (isSubmitting will be set to false after submission)
          while (this.isSubmitting && this.isMining) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          this.log('info', 'Solution submission completed, resuming mining...');
          
          // Wait a bit before fetching new challenge after successful submission
          if (this.isMining) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
        
        // Update stats after mining attempt
        this.updateStats();
      } catch (error: any) {
        this.log('error', `Mining error: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Generate a random 64-bit nonce (like FTIC-Miner)
   * Uses crypto.getRandomValues for better randomness
   * FTIC-Miner generates random bytes and uses them directly as the nonce
   */
  private generateRandomNonce(): bigint {
    // Generate random bytes for 64-bit nonce (8 bytes)
    // Use Uint8Array for better control over byte generation
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    
    // Convert to bigint (big-endian, matching Solidity uint256)
    // This matches how FTIC-Miner's C++ code handles the bytes
    let nonce = BigInt(0);
    for (let i = 0; i < 8; i++) {
      nonce = (nonce << BigInt(8)) | BigInt(bytes[i]);
    }
    
    return nonce;
  }

  /**
   * Mine using random nonce generation (like FTIC-Miner)
   * Each thread generates completely random nonces independently
   */
  private async mineRandom(
    challenge: string,
    address: string,
    target: bigint
  ): Promise<void> {
    // Larger batch size for better performance - reduce overhead
    const batchSize = 10000;
    let batchHashes = 0;
    let yieldCounter = 0;

    while (this.isMining && !this.isSubmitting) {
      // Generate a batch of random nonces (like FTIC-Miner)
      for (let i = 0; i < batchSize; i++) {
        // Stop immediately if submission is in progress (another thread found a solution)
        if (this.isSubmitting) {
          return;
        }

        // Generate random nonce (like FTIC-Miner's random generation)
        const nonce = this.generateRandomNonce();

        // Use the hash method that matches the contract
        const hashValue = this.hash(challenge, address, nonce);
        this.totalHashes++;
        batchHashes++;

        if (hashValue <= target) {
          // Solution found! Set flag to stop all other threads
          this.isSubmitting = true;
          this.log('success', `Solution found! Nonce: ${nonce.toString()}`);
          this.log('info', 'Pausing all mining threads for submission...');
          
          try {
            const submitted = await this.submitSolution(nonce, challenge);
            if (submitted) {
              // Update stats after successful submission
              this.updateStats();
            }
          } catch (error: any) {
            this.log('error', `Failed to submit solution: ${error.message}`);
          } finally {
            // Always clear submission flag after completion (success or failure)
            this.isSubmitting = false;
          }
          return;
        }
      }
      
      yieldCounter++;

      // Yield less frequently to improve performance (every 5 batches = 50k hashes)
      if (yieldCounter >= 5) {
        yieldCounter = 0;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // Update stats less frequently to reduce overhead (every 50k hashes)
      if (batchHashes >= 50000) {
        this.updateStats();
        batchHashes = 0;
      }
    }
  }

  private updateStats() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    this.stats.hashesPerSecond = elapsed > 0 ? this.totalHashes / elapsed : 0;
    this.stats.totalHashes = this.totalHashes;
    this.stats.solutionsFound = this.solutionsFound;
    this.stats.tokensMinted = this.tokensMinted;

    if (this.onStatsUpdate) {
      this.onStatsUpdate({ ...this.stats });
    }
  }

  getStats(): MiningStats {
    return { ...this.stats };
  }
}


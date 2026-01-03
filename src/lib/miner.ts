/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from 'ethers';
import { RpcManager } from './rpcManager';
import { Settings, MiningStats, RpcEndpoint, LogEntry, RewardTier } from '../types';
import { addLog } from '../pages/consoleUtils';
import ERC918_ABI from '../../abi.json';

export class Miner {
  private rpcManager: RpcManager;
  private settings!: Settings;
  private isMining: boolean = false;
  private isSubmitting: boolean = false; // Used by queue processor to show UI state
  private stats: MiningStats;
  private workers: Worker[] = [];
  private gpuWorkers: Worker[] = [];
  private workerHashes: Map<number, number> = new Map(); // Track hashes per worker
  private gpuWorkerHashes: Map<number, number> = new Map(); // Track hashes per GPU worker
  private solutionQueue: Array<{ nonce: string; workerId: number; challenge: string }> = []; // Queue for all found solutions
  private isProcessingQueue: boolean = false; // Flag to prevent multiple queue processors
  private contract: ethers.Contract | null = null;
  private wallet: ethers.Wallet | null = null;
  private provider: ethers.JsonRpcProvider | null = null;
  private onStatsUpdate?: (stats: MiningStats) => void;
  private onLog?: (log: LogEntry) => void;
  private onTierUpdate?: (tier: RewardTier, reward: string) => void;
  private startTime: number = 0;
  private totalHashes: number = 0;
  private gpuTotalHashes: number = 0;
  private solutionsFound: number = 0;
  private tokensMinted: number = 0;
  private failedSolutions: number = 0;
  private enigma23Count: number = 0;
  private erisFavorCount: number = 0;
  private discordianBlessingCount: number = 0;
  private discordantMineCount: number = 0;
  private neutralMineCount: number = 0;

  constructor(rpcManager: RpcManager) {
    this.rpcManager = rpcManager;
    this.stats = {
      hashesPerSecond: 0,
      totalHashes: 0,
      solutionsFound: 0,
      tokensMinted: 0,
      failedSolutions: 0,
      currentChallenge: '0x',
      currentDifficulty: '0',
      currentReward: '0',
      isMining: false,
      solutionFound: false,
      isSubmitting: false,
      pendingSolutions: 0,
      errorMessage: null,
      lastTier: null,
      enigma23Count: 0,
      erisFavorCount: 0,
      discordianBlessingCount: 0,
      discordantMineCount: 0,
      neutralMineCount: 0,
      gpuHashesPerSecond: 0,
      gpuTotalHashes: 0,
      gpuEnabled: false,
    };
  }

  setOnStatsUpdate(callback: (stats: MiningStats) => void) {
    this.onStatsUpdate = callback;
  }

  setOnTierUpdate(callback: (tier: RewardTier, reward: string) => void) {
    this.onTierUpdate = callback;
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
    // Use rpc_rate_limit_ms for general RPC rate limiting
    this.rpcManager.setRateLimit(settings.rpc_rate_limit_ms);
    this.rpcManager.setSwitchDelay(settings.rpc_switch_delay_seconds * 1000);

    const chainRpcs = rpcs[settings.selected_chain_id] || [];
    if (chainRpcs.length > 0) {
      await this.rpcManager.initializeRpcs(settings.selected_chain_id, chainRpcs);
    }
  }

  private async getContractAddress(): Promise<string> {
    const contracts = await window.electronAPI.readContracts();
    if (!contracts) {
      throw new Error('Failed to load contracts.json');
    }
    return contracts[this.settings.network_type].address;
  }

  async initialize() {
    try {
      const chainRpcs = await window.electronAPI.readRpcs();
      if (!chainRpcs || !chainRpcs[this.settings.selected_chain_id]) {
        throw new Error(`No RPCs configured for chain ${this.settings.selected_chain_id}`);
      }

      // Get chain name for logging
      const chains = await window.electronAPI.readChains();
      const chainName = chains?.[this.settings.selected_chain_id]?.name || `Chain ${this.settings.selected_chain_id}`;

      await this.rpcManager.initializeRpcs(
        this.settings.selected_chain_id,
        chainRpcs[this.settings.selected_chain_id]
      );

      this.provider = await this.rpcManager.getProvider(
        this.settings.selected_chain_id,
        chainRpcs[this.settings.selected_chain_id]
      );

      this.wallet = new ethers.Wallet(this.settings.mining_account_private_key, this.provider);
      
      const contractAddress = await this.getContractAddress();
      this.contract = new ethers.Contract(
        contractAddress,
        ERC918_ABI,
        this.wallet
      );

      this.log('success', `Miner initialized on ${chainName} (${this.settings.network_type}, contract: ${contractAddress})`);
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
        await this.rpcManager.switchToNextRpc(
          this.settings.selected_chain_id,
          chainRpcs[this.settings.selected_chain_id]
        );
        provider = await this.rpcManager.getProvider(
          this.settings.selected_chain_id,
          chainRpcs[this.settings.selected_chain_id]
        );
      }

      const contractAddress = await this.getContractAddress();
      const contractWithNewProvider = new ethers.Contract(
        contractAddress,
        ERC918_ABI,
        provider
      );

      const [challenge, difficulty, reward] = await Promise.all([
        contractWithNewProvider.getChallengeNumber(),
        contractWithNewProvider.getMiningDifficulty(),
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

  // Note: hash() method removed - now using Web Workers for true parallelism
  // Workers handle hashing internally using js-sha3 library

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
        // Auto-switch to next RPC when rate limited
        await this.rpcManager.switchToNextRpc(
          this.settings.selected_chain_id,
          chainRpcs[this.settings.selected_chain_id]
        );
        provider = await this.rpcManager.getProvider(
          this.settings.selected_chain_id,
          chainRpcs[this.settings.selected_chain_id]
        );
      }

      const walletWithProvider = new ethers.Wallet(this.settings.mining_account_private_key, provider);
      const contractAddress = await this.getContractAddress();
      const contractWithProvider = new ethers.Contract(
        contractAddress,
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
      // Calculate fees dynamically based on network conditions
      let maxFeePerGas: bigint;
      let maxPriorityFeePerGas: bigint;
      
      try {
        // Get current fee data from the network
        const feeData = await provider.getFeeData();
        
        // Calculate maxPriorityFeePerGas (miner tip)
        // Use user's priority fee setting, but ensure it's at least the network's suggested priority fee
        const userPriorityFee = ethers.parseUnits(
          this.settings.priority_gas_fee_gwei.toString(),
          'gwei'
        );
        maxPriorityFeePerGas = feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas > userPriorityFee
          ? feeData.maxPriorityFeePerGas
          : userPriorityFee;
        
        // Calculate maxFeePerGas
        // maxFeePerGas = (baseFee * 2) + maxPriorityFeePerGas
        // This ensures we can pay for base fee + priority fee even if base fee increases
        const baseFee = feeData.gasPrice || feeData.maxFeePerGas || ethers.parseUnits('1', 'gwei');
        const calculatedMaxFee = (baseFee * BigInt(2)) + maxPriorityFeePerGas;
        
        // Use user's max fee setting if provided, otherwise use calculated value
        const userMaxFee = ethers.parseUnits(
          this.settings.gas_price_gwei.toString(),
          'gwei'
        );
        maxFeePerGas = userMaxFee > calculatedMaxFee ? userMaxFee : calculatedMaxFee;
        
        this.log('info', `Gas fees - Base: ${ethers.formatUnits(baseFee, 'gwei')} gwei, Priority: ${ethers.formatUnits(maxPriorityFeePerGas, 'gwei')} gwei, Max: ${ethers.formatUnits(maxFeePerGas, 'gwei')} gwei`);
      } catch (error) {
        // Fallback to user settings if fee data unavailable
        this.log('warn', 'Could not fetch network fee data, using configured values');
        maxFeePerGas = ethers.parseUnits(
          this.settings.gas_price_gwei.toString(),
          'gwei'
        );
        maxPriorityFeePerGas = ethers.parseUnits(
          this.settings.priority_gas_fee_gwei.toString(),
          'gwei'
        );
      }

      // Estimate gas limit with buffer, fallback to configured value
      let gasLimit: bigint;
      try {
        const estimatedGas = await contractWithProvider.mint.estimateGas(nonce, challengeDigest);
        // Add 20% buffer to estimated gas to prevent out-of-gas errors
        gasLimit = (estimatedGas * BigInt(120)) / BigInt(100);
        this.log('info', `Estimated gas: ${estimatedGas.toString()}, Using: ${gasLimit.toString()} (with 20% buffer)`);
      } catch (error: any) {
        // Extract error message from various possible locations
        const errorMsg = (
          error.message || 
          error.reason || 
          (error.revert && error.revert.args && error.revert.args[0]) ||
          ''
        ).toLowerCase();
        
        // Check for "Already rewarded in this block" - this means solution is invalid
        if (errorMsg.includes('already rewarded') || errorMsg.includes('already rewarded in this block')) {
          this.log('warn', 'Solution already submitted in this block by another miner, skipping...');
          return false; // Skip this solution, continue mining
        }
        
        // Check for "Digest exceeds target" - solution is invalid (stale challenge or wrong hash)
        if (errorMsg.includes('digest exceeds target')) {
          this.log('warn', 'Solution digest exceeds target (likely stale challenge), skipping...');
          return false; // Skip this solution, continue mining
        }
        
        // Check for "Mining not started yet" - chain-level issue, stop mining
        if (errorMsg.includes('mining not started yet')) {
          // Try to get the chain name for a better error message
          let chainName = `Chain ${this.settings.selected_chain_id}`;
          try {
            const chains = await window.electronAPI.readChains();
            if (chains && chains[this.settings.selected_chain_id]) {
              chainName = chains[this.settings.selected_chain_id].name;
            }
          } catch (e) {
            // Fall back to chain ID if we can't load chains
          }
          const userFriendlyMsg = `Mining has not started yet for ${chainName}. Please wait for mining to be enabled on the contract.`;
          this.log('error', userFriendlyMsg);
          this.stats.errorMessage = userFriendlyMsg;
          if (this.onStatsUpdate) {
            this.onStatsUpdate({ ...this.stats });
          }
          // Stop mining on this error
          this.log('error', 'Stopping miner due to mining not started error');
          await this.stop();
          return false;
        }
        
        // If estimation fails for other reasons, use configured gas limit (default 200000 from MVis-tokenminer)
        const configuredLimit = BigInt(this.settings.gas_limit || 200000);
        gasLimit = configuredLimit;
        this.log('warn', `Gas estimation failed: ${error.message || error.reason || 'unknown error'}, using configured limit: ${gasLimit.toString()}`);
      }

      // Ensure gas limit is at least a safe minimum (100000) to prevent "intrinsic gas too low" errors
      // The configured limit might be too low, so we enforce a minimum safe value
      const safeMinimum = BigInt(100000);
      if (gasLimit < safeMinimum) {
        this.log('warn', `Gas limit ${gasLimit.toString()} is too low, using safe minimum: ${safeMinimum.toString()}`);
        gasLimit = safeMinimum;
      }
      
      // Also ensure it's at least the configured minimum (but don't go below safe minimum)
      const configuredMin = BigInt(this.settings.gas_limit || 200000);
      if (gasLimit < configuredMin && configuredMin >= safeMinimum) {
        gasLimit = configuredMin;
        this.log('info', `Gas limit below configured minimum, using: ${gasLimit.toString()}`);
      }

      const tx = await contractWithProvider.mint(nonce, challengeDigest, {
        maxFeePerGas,
        maxPriorityFeePerGas,
        gasLimit,
      });

      // Verify transaction was actually submitted to the network
      // The transaction object is created immediately, but we need to verify it was broadcast
      // Transactions can be dropped if: gas price too low, nonce issues, network congestion, etc.
      let txVerified = false;
      let verificationAttempts = 0;
      const maxVerificationAttempts = 3; // Check 3 times over 6 seconds
      const verificationDelay = 2000; // Wait 2 seconds between checks
      
      this.log('info', `Transaction submitted to mempool: ${tx.hash} (verifying broadcast - does not guarantee it will be mined)...`);
      
      while (!txVerified && verificationAttempts < maxVerificationAttempts) {
        try {
          const provider = contractWithProvider.runner?.provider || this.provider;
          if (provider) {
            // Try to get the transaction from the network
            const networkTx = await provider.getTransaction(tx.hash);
            if (networkTx) {
              // Transaction exists in network - verify it's valid
              if (networkTx.hash === tx.hash) {
                txVerified = true;
                this.log('info', `Transaction verified in mempool: ${tx.hash} (waiting for mining - may be dropped if gas too low)`);
                break;
              } else {
                this.log('warn', `Transaction hash mismatch: expected ${tx.hash}, got ${networkTx.hash}`);
              }
            } else {
              // Transaction not found in network yet, wait and retry
              verificationAttempts++;
              if (verificationAttempts < maxVerificationAttempts) {
                this.log('info', `Transaction ${tx.hash} not yet in network, retrying... (attempt ${verificationAttempts}/${maxVerificationAttempts})`);
                await new Promise(resolve => setTimeout(resolve, verificationDelay));
              }
            }
          } else {
            // No provider available, log warning but continue (legacy behavior)
            this.log('warn', `Transaction submitted but cannot verify (no provider): ${tx.hash}`);
            txVerified = true; // Assume success to continue
            break;
          }
        } catch (verifyError: any) {
          verificationAttempts++;
          const errorMsg = verifyError.message || String(verifyError);
          
          // Check for specific errors that indicate transaction was dropped
          if (errorMsg.includes('not found') || errorMsg.includes('unknown transaction')) {
            if (verificationAttempts >= maxVerificationAttempts) {
              this.log('error', `Transaction ${tx.hash} was not found in network after ${maxVerificationAttempts} attempts. It may have been dropped by the network.`);
              return false;
            }
          } else {
            // Other errors (network issues, etc.) - log and retry
            this.log('warn', `Error verifying transaction (attempt ${verificationAttempts}/${maxVerificationAttempts}): ${errorMsg}`);
          }
          
          if (verificationAttempts < maxVerificationAttempts) {
            await new Promise(resolve => setTimeout(resolve, verificationDelay));
          } else {
            this.log('error', `Failed to verify transaction ${tx.hash} after ${maxVerificationAttempts} attempts. Transaction may have been dropped.`);
            return false;
          }
        }
      }
      
      if (!txVerified) {
        this.log('error', `Transaction ${tx.hash} verification failed. Transaction may have been dropped by the network.`);
        return false;
      }
      
      // Additional stability check: verify transaction is still in mempool after a short delay
      // This helps catch transactions that are immediately dropped after initial verification
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      try {
        const provider = contractWithProvider.runner?.provider || this.provider;
        if (provider) {
          const stabilityCheck = await provider.getTransaction(tx.hash);
          if (!stabilityCheck) {
            this.log('error', `Transaction ${tx.hash} was dropped from mempool shortly after submission. It will not appear on blockchain.`);
            return false;
          }
          // Also check if transaction was replaced (same nonce, different hash)
          if (stabilityCheck && stabilityCheck.hash !== tx.hash) {
            this.log('warn', `Transaction ${tx.hash} was replaced by ${stabilityCheck.hash} (same nonce). Original transaction will not appear on blockchain.`);
            return false;
          }
          this.log('info', `Transaction ${tx.hash} stability check passed - still in mempool`);
        }
      } catch (stabilityError: any) {
        this.log('warn', `Stability check failed for ${tx.hash}: ${stabilityError.message}. Continuing anyway...`);
      }
      
      // Wait for receipt with timeout to prevent hanging
      // Default timeout: 5 minutes (300 seconds) - should be enough for most networks
      const receiptTimeout = 300000; // 5 minutes in milliseconds
      let receipt: ethers.ContractTransactionReceipt | null = null;
      
      // Start periodic status logging and mempool checks for pending transactions
      const statusCheckInterval = 30000; // Check every 30 seconds
      let statusCheckCount = 0;
      const maxStatusChecks = Math.floor(receiptTimeout / statusCheckInterval);
      let lastMempoolCheck: ethers.TransactionResponse | null = null;
      const statusLogger = setInterval(async () => {
        statusCheckCount++;
        if (statusCheckCount <= maxStatusChecks) {
          try {
            const provider = contractWithProvider.runner?.provider || this.provider;
            if (provider) {
              // Check if transaction is still in mempool
              const mempoolTx = await provider.getTransaction(tx.hash);
              if (!mempoolTx) {
                // Transaction disappeared from mempool - it was likely dropped
                clearInterval(statusLogger);
                this.log('error', `Transaction ${tx.hash} disappeared from mempool after ${statusCheckCount * 30}s. It was likely dropped and will not appear on blockchain.`);
                return;
              }
              
              // Check if transaction was replaced
              if (mempoolTx.hash !== tx.hash) {
                clearInterval(statusLogger);
                this.log('warn', `Transaction ${tx.hash} was replaced by ${mempoolTx.hash}. Original will not appear on blockchain.`);
                return;
              }
              
              // Check if transaction was mined (has block number)
              if (mempoolTx.blockNumber !== null) {
                // Transaction was mined, receipt should be available soon
                this.log('info', `Transaction ${tx.hash} was mined in block ${mempoolTx.blockNumber}. Waiting for receipt...`);
              } else {
                // Still pending
                this.log('info', `Transaction ${tx.hash} still pending in mempool... (${statusCheckCount * 30}s elapsed)`);
              }
              
              lastMempoolCheck = mempoolTx;
            }
          } catch (checkError: any) {
            // Log error but continue checking
            this.log('warn', `Error checking transaction status: ${checkError.message}`);
          }
        }
      }, statusCheckInterval);
      
      try {
        // Create a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            clearInterval(statusLogger);
            reject(new Error(`Transaction receipt timeout after ${receiptTimeout / 1000} seconds. Transaction hash: ${tx.hash}`));
          }, receiptTimeout);
        });
        
        // Race between receipt and timeout
        receipt = await Promise.race([
          tx.wait().then((r) => {
            clearInterval(statusLogger);
            return r;
          }),
          timeoutPromise
        ]) as ethers.ContractTransactionReceipt;
        
        this.log('success', `Solution confirmed! Block: ${receipt.blockNumber}`);
      } catch (waitError: any) {
        clearInterval(statusLogger); // Always clear interval on error
        
        // Check if this is a timeout error
        if (waitError.message && waitError.message.includes('timeout')) {
          this.log('warn', `Transaction receipt timeout for ${tx.hash} after ${receiptTimeout / 1000} seconds. Checking status manually...`);
          
          // Try to get receipt manually as fallback
          try {
            const provider = contractWithProvider.runner?.provider || this.provider;
            if (provider) {
              // First check if transaction is still in mempool
              const txResponse = await provider.getTransaction(tx.hash);
              if (!txResponse) {
                // Transaction not found - it was dropped from mempool
                this.log('error', `Transaction ${tx.hash} was dropped from mempool and will not appear on blockchain. It was likely dropped due to low gas price, nonce issues, or network congestion.`);
                return false;
              }
              
              // Check if transaction was replaced
              if (txResponse.hash !== tx.hash) {
                this.log('warn', `Transaction ${tx.hash} was replaced by ${txResponse.hash} (same nonce). Original will not appear on blockchain.`);
                return false;
              }
              
              // Check if transaction was mined but receipt not available yet
              if (txResponse.blockNumber !== null) {
                // Transaction was mined, try to get receipt
                await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 more seconds
                const manualReceipt = await provider.getTransactionReceipt(tx.hash);
                if (manualReceipt) {
                  receipt = manualReceipt as ethers.ContractTransactionReceipt;
                  this.log('success', `Solution confirmed via manual check! Block: ${receipt.blockNumber}`);
                } else {
                  this.log('warn', `Transaction ${tx.hash} was mined in block ${txResponse.blockNumber} but receipt not yet available.`);
                  // Transaction was mined, so it will appear on blockchain eventually
                  // Return false to avoid processing without receipt
                  return false;
                }
              } else {
                // Transaction still pending in mempool after timeout
                this.log('error', `Transaction ${tx.hash} is still pending in mempool after ${receiptTimeout / 1000} seconds. It may be stuck or will be dropped. This transaction may not appear on blockchain.`);
                return false;
              }
            } else {
              this.log('error', `Transaction ${tx.hash} receipt timeout and no provider available for manual check.`);
              return false;
            }
          } catch (manualError: any) {
            this.log('error', `Failed to manually check transaction receipt: ${manualError.message}`);
            return false;
          }
        } else {
          // Some other error occurred
          throw waitError; // Re-throw to be handled by outer catch block
        }
      }
      
      // Ensure we have a receipt before proceeding
      if (!receipt) {
        this.log('error', `No receipt available for transaction ${tx.hash}`);
        return false;
      }
      
      // Check if transaction was reverted (status: 0)
      if (receipt.status === 0) {
        this.log('warn', `Transaction ${tx.hash} was reverted (status: 0). Solution may be invalid or already submitted.`);
        // Try to extract revert reason if available
        try {
          const provider = contractWithProvider.runner?.provider || this.provider;
          if (provider) {
            // Try to call the contract to see if we can get a revert reason
            // This is best-effort, may not always work
            const code = await provider.call({
              to: contractWithProvider.target,
              data: tx.data,
            });
            if (code === '0x') {
              this.log('info', 'Transaction reverted but no revert reason available');
            }
          }
        } catch (revertError: any) {
          // Ignore errors when trying to get revert reason
        }
        return false; // Transaction failed, don't process receipt
      }

      // Parse events from receipt - wrap in try-catch to prevent errors from stopping miner
      // CRITICAL: Always process receipt and send tier notifications, even if queue is long
      let receiptProcessed = false;
      try {
        // Parse Mint event to get reward amount
        const mintEvent = receipt.logs.find((log: any) => {
          try {
            const parsed = contractWithProvider.interface.parseLog(log);
            return parsed && parsed.name === 'Mint';
          } catch {
            return false;
          }
        });

        let rewardAmount = BigInt(0);
        if (mintEvent) {
          try {
            const parsed = contractWithProvider.interface.parseLog(mintEvent);
            if (parsed && parsed.args) {
              // Mint event has rewardAmount field (camelCase)
              const rewardArg = parsed.args.rewardAmount || parsed.args.reward_amount;
              if (rewardArg != null && rewardArg !== undefined) {
                rewardAmount = BigInt(rewardArg.toString());
                this.tokensMinted += Number(ethers.formatEther(rewardAmount));
                this.solutionsFound++;
                this.log('info', `Mint event parsed: ${ethers.formatEther(rewardAmount)} tokens`);
              } else {
                // If rewardAmount is null, still increment solution count since transaction succeeded
                this.log('warn', 'Mint event found but rewardAmount is null, incrementing solution count anyway');
                this.solutionsFound++;
              }
            } else {
              // If parsing succeeded but args is missing, still increment
              this.log('warn', 'Mint event parsed but args missing, incrementing solution count anyway');
              this.solutionsFound++;
            }
          } catch (parseError: any) {
            this.log('warn', `Failed to parse Mint event: ${parseError.message}. Transaction succeeded, incrementing counters anyway.`);
            // Still increment counters since transaction was successful
            this.solutionsFound++;
          }
        } else {
          // No Mint event found, but transaction succeeded - increment counters anyway
          this.log('warn', 'No Mint event found in receipt, but transaction succeeded. Incrementing solution count.');
          this.solutionsFound++;
        }

        // Parse tier events to determine which tier was awarded
        const tierEvents = ['Enigma23', 'ErisFavor', 'DiscordianBlessing', 'DiscordantMine', 'NeutralMine'];
        let detectedTier: RewardTier = null;
        let tierRewardAmount: bigint | null = null;
        
        for (const tierName of tierEvents) {
          const tierEvent = receipt.logs.find((log: any) => {
            try {
              const parsed = contractWithProvider.interface.parseLog(log);
              return parsed && parsed.name === tierName;
            } catch {
              return false;
            }
          });

          if (tierEvent) {
            detectedTier = tierName as RewardTier;
            try {
              const parsed = contractWithProvider.interface.parseLog(tierEvent);
              if (parsed && parsed.args) {
                // Try to get reward from tier event, but handle null/undefined
                const rewardArg = parsed.args.reward;
                if (rewardArg != null && rewardArg !== undefined) {
                  tierRewardAmount = BigInt(rewardArg.toString());
                }
              }
            } catch (parseError: any) {
              this.log('warn', `Failed to parse ${tierName} event: ${parseError.message}`);
            }
            break; // Only one tier event should be emitted per transaction
          }
        }

        // Fallback: If no tier event found, try to parse MinerStatsUpdated event
        // This event contains tier number (1-5) which we can map to tier names
        if (!detectedTier) {
          const minerStatsEvent = receipt.logs.find((log: any) => {
            try {
              const parsed = contractWithProvider.interface.parseLog(log);
              return parsed && parsed.name === 'MinerStatsUpdated';
            } catch {
              return false;
            }
          });

          if (minerStatsEvent) {
            try {
              const parsed = contractWithProvider.interface.parseLog(minerStatsEvent);
              if (parsed && parsed.args) {
                const tierNumber = parsed.args.tier;
                if (tierNumber != null && tierNumber !== undefined) {
                  // Map tier number to tier name: 1=DiscordantMine, 2=NeutralMine, 3=ErisFavor, 4=DiscordianBlessing, 5=Enigma23
                  const tierMap: Record<number, RewardTier> = {
                    1: 'DiscordantMine',
                    2: 'NeutralMine',
                    3: 'ErisFavor',
                    4: 'DiscordianBlessing',
                    5: 'Enigma23',
                  };
                  const tierNum = Number(tierNumber.toString());
                  if (tierMap[tierNum]) {
                    detectedTier = tierMap[tierNum];
                    this.log('info', `Detected tier from MinerStatsUpdated event: ${detectedTier} (tier ${tierNum})`);
                  }
                }
              }
            } catch (parseError: any) {
              this.log('warn', `Failed to parse MinerStatsUpdated event: ${parseError.message}`);
            }
          }
        }

        // Use tier event reward if available, otherwise fall back to Mint event reward
        const finalRewardAmount = tierRewardAmount != null ? tierRewardAmount : rewardAmount;
        const rewardString = ethers.formatEther(finalRewardAmount);

        // If we didn't get reward from Mint event but got it from tier event, update tokensMinted
        if (rewardAmount === BigInt(0) && tierRewardAmount != null && tierRewardAmount > BigInt(0)) {
          this.tokensMinted += Number(ethers.formatEther(tierRewardAmount));
          this.log('info', `Updated tokensMinted from tier event: ${ethers.formatEther(tierRewardAmount)} tokens`);
        }

        // Update last tier in stats
        if (detectedTier) {
          this.stats.lastTier = detectedTier;
          
          // Increment appropriate tier counter
          if (detectedTier === 'Enigma23') {
            this.enigma23Count++;
            this.log('success', `🎰🎰🎰 ENIGMA23 JACKPOT #${this.enigma23Count}! Reward: ${rewardString} tokens 🎰🎰🎰`);
          } else if (detectedTier === 'ErisFavor') {
            this.erisFavorCount++;
            this.log('success', `⭐ Eris Favor tier awarded! Reward: ${rewardString} tokens`);
          } else if (detectedTier === 'DiscordianBlessing') {
            this.discordianBlessingCount++;
            this.log('success', `✨ Discordian Blessing tier awarded! Reward: ${rewardString} tokens`);
          } else if (detectedTier === 'DiscordantMine') {
            this.discordantMineCount++;
            this.log('success', `⚡ Discordant Mine tier awarded! Reward: ${rewardString} tokens`);
          } else if (detectedTier === 'NeutralMine') {
            this.neutralMineCount++;
            this.log('success', `⚪ Neutral Mine tier awarded! Reward: ${rewardString} tokens`);
          }
          
          // Notify UI about tier update - CRITICAL: Always send notification
          if (this.onTierUpdate) {
            try {
              this.onTierUpdate(detectedTier, rewardString);
              this.log('info', `Tier notification sent: ${detectedTier}, ${rewardString} tokens`);
            } catch (notificationError: any) {
              this.log('error', `Failed to send tier notification: ${notificationError.message}`);
            }
          } else {
            this.log('warn', 'onTierUpdate callback not set - tier notification not sent!');
          }
        } else {
          // If no tier event found, default to NeutralMine (base tier)
          detectedTier = 'NeutralMine';
          this.stats.lastTier = detectedTier;
          this.neutralMineCount++;
          // Always send notification even if reward is 0 to ensure UI is updated
          if (this.onTierUpdate) {
            try {
              this.onTierUpdate(detectedTier, rewardString);
              this.log('info', `Tier notification sent (default): ${detectedTier}, ${rewardString} tokens`);
            } catch (notificationError: any) {
              this.log('error', `Failed to send default tier notification: ${notificationError.message}`);
            }
          }
        }
        
        receiptProcessed = true;
      } catch (eventParseError: any) {
        // Log error but don't fail the submission - transaction was successful
        this.log('warn', `Failed to parse events from receipt: ${eventParseError.message}. Transaction was successful.`);
        // Still increment counters if we can't parse events
        this.solutionsFound++;
        // Default to NeutralMine if we can't detect tier
        this.stats.lastTier = 'NeutralMine';
        this.neutralMineCount++;
        
        // IMPORTANT: Still send tier notification even if parsing failed
        // Use a default reward amount from the receipt if possible
        try {
          // Try to extract reward from receipt logs as fallback
          let fallbackReward = BigInt(0);
          if (receipt.logs && receipt.logs.length > 0) {
            // Try to find any event with a reward field
            for (const log of receipt.logs) {
              try {
                const parsed = contractWithProvider.interface.parseLog(log);
                if (parsed && parsed.args) {
                  const rewardArg = parsed.args.reward || parsed.args.rewardAmount || parsed.args.reward_amount;
                  if (rewardArg != null && rewardArg !== undefined) {
                    fallbackReward = BigInt(rewardArg.toString());
                    break;
                  }
                }
              } catch {
                // Continue searching
              }
            }
          }
          
          const fallbackRewardString = ethers.formatEther(fallbackReward);
          if (this.onTierUpdate && fallbackReward > BigInt(0)) {
            this.onTierUpdate('NeutralMine', fallbackRewardString);
            this.log('info', `Sent fallback tier notification: NeutralMine, ${fallbackRewardString} tokens`);
          } else if (this.onTierUpdate) {
            // Send notification even with 0 reward to ensure UI is updated
            this.onTierUpdate('NeutralMine', '0');
          }
        } catch (notificationError: any) {
          this.log('error', `Failed to send tier notification after receipt parse error: ${notificationError.message}`);
        }
        
        receiptProcessed = true;
      }
      
      // Ensure receipt was processed - log if it wasn't
      if (!receiptProcessed) {
        this.log('error', 'Receipt processing did not complete - this should not happen!');
      }
      
      // Update stats immediately after incrementing counters
      this.updateStats();

      return true;
    } catch (error: any) {
      // Extract error message from various possible locations (ethers.js v6 has different error structure)
      const errorMessageRaw = (
        error.message || 
        error.reason || 
        (error.revert && error.revert.args && error.revert.args[0]) ||
        (error.info && error.info.error && error.info.error.message) ||
        (error.shortMessage) ||
        ''
      );
      const errorMessage = errorMessageRaw.toLowerCase();
      
      // Also check if this is a transaction that was mined but reverted (status: 0)
      // In ethers v6, reverted transactions throw CALL_EXCEPTION with receipt info
      const isRevertedTransaction = error.code === 'CALL_EXCEPTION' && 
        error.receipt && error.receipt.status === 0;
      
      // Check for "Already rewarded in this block" - this is expected and should be skipped
      if (errorMessage.includes('already rewarded') || errorMessage.includes('already rewarded in this block')) {
        this.log('warn', 'Solution already submitted in this block by another miner, skipping...');
        return false; // Skip this solution, continue mining
      }
      
      // Check for "Digest exceeds target" - solution is invalid (stale challenge or wrong hash)
      if (errorMessage.includes('digest exceeds target')) {
        this.log('warn', 'Solution digest exceeds target (likely stale challenge), skipping...');
        return false; // Skip this solution, continue mining
      }
      
      // Check for reverted transaction with no reason - likely stale solution or race condition
      // This happens when two solutions are found nearly simultaneously for the same challenge
      if (isRevertedTransaction && (error.reason === null || error.reason === undefined)) {
        this.log('warn', 'Solution transaction reverted (likely stale challenge or race condition with another solution), skipping...');
        return false; // Skip this solution, continue mining
      }
      
      // Check for "Mining not started yet" - chain-level issue, stop mining
      if (errorMessage.includes('mining not started yet')) {
        // Try to get the chain name for a better error message
        let chainName = `Chain ${this.settings.selected_chain_id}`;
        try {
          const chains = await window.electronAPI.readChains();
          if (chains && chains[this.settings.selected_chain_id]) {
            chainName = chains[this.settings.selected_chain_id].name;
          }
        } catch (e) {
          // Fall back to chain ID if we can't load chains
        }
        const userFriendlyMsg = `Mining has not started yet for ${chainName}. Please wait for mining to be enabled on the contract.`;
        this.log('error', userFriendlyMsg);
        this.stats.errorMessage = userFriendlyMsg;
        if (this.onStatsUpdate) {
          this.onStatsUpdate({ ...this.stats });
        }
        // Stop mining on this error
        this.log('error', 'Stopping miner due to mining not started error');
        await this.stop();
        return false;
      }
      
      // Check if error is due to RPC rate limiting/throttling
      const isRpcError = this.isRpcRateLimitError(error);
      
      if (isRpcError) {
        // RPC rate limiting - try switching RPC
        this.log('warn', `RPC rate limited during submission, attempting to switch RPC...`);
        try {
          const chainRpcs = await window.electronAPI.readRpcs();
          if (chainRpcs && chainRpcs[this.settings.selected_chain_id]) {
            await this.rpcManager.switchToNextRpc(
              this.settings.selected_chain_id,
              chainRpcs[this.settings.selected_chain_id]
            );
            this.log('info', 'RPC switched, retrying submission...');
            // Retry submission once with new RPC
            return await this.submitSolution(nonce, challenge);
          }
        } catch (switchError: any) {
          this.log('error', `Failed to switch RPC: ${switchError.message}`);
          // Fall through to stop miner
        }
      }
      
      // Non-RPC error or RPC switch failed - stop miner and show notification
      const errorMsg = `Failed to submit solution: ${error.message || error.reason || 'unknown error'}`;
      this.log('error', errorMsg);
      this.stats.errorMessage = errorMsg;
      if (this.onStatsUpdate) {
        this.onStatsUpdate({ ...this.stats });
      }
      
      // Stop mining on submission error (except RPC errors which are handled above)
      if (!isRpcError) {
        this.log('error', 'Stopping miner due to submission error');
        await this.stop();
      }
      
      return false;
    }
  }

  /**
   * Check if an error is due to RPC rate limiting or throttling
   */
  private isRpcRateLimitError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = (error.message || '').toLowerCase();
    const errorCode = error.code;
    const errorStatus = error.status;
    
    // Check for common RPC rate limiting indicators
    const rateLimitIndicators = [
      'rate limit',
      'rate exceeded',
      'too many requests',
      'throttle',
      'throttled',
      '429',
      '503',
      'service unavailable',
      'timeout',
      'connection',
      'network',
      'econnrefused',
      'enotfound',
    ];
    
    // Check error message
    if (rateLimitIndicators.some(indicator => errorMessage.includes(indicator))) {
      return true;
    }
    
    // Check HTTP status codes (429 = Too Many Requests, 503 = Service Unavailable)
    if (errorStatus === 429 || errorStatus === 503) {
      return true;
    }
    
    // Check ethers error codes
    // SERVER_ERROR, TIMEOUT, NETWORK_ERROR, etc.
    if (errorCode === 'SERVER_ERROR' || errorCode === 'TIMEOUT' || errorCode === 'NETWORK_ERROR') {
      // But not CALL_EXCEPTION (contract execution errors)
      if (errorCode !== 'CALL_EXCEPTION') {
        return true;
      }
    }
    
    // Check for JSON-RPC error codes
    // -32000 to -32099 are server errors
    if (typeof errorCode === 'number' && errorCode >= -32099 && errorCode <= -32000) {
      return true;
    }
    
    return false;
  }

  private createWorker(): Worker {
    // Create a web worker using the bundled worker file
    // Vite will bundle this properly with ethers imported
    return new Worker(
      new URL('./miningWorker.ts', import.meta.url),
      { type: 'module' }
    );
  }

  private createGPUWorker(): Worker {
    // Create a GPU mining worker using WebGPU
    return new Worker(
      new URL('./gpuMiningWorker.ts', import.meta.url),
      { type: 'module' }
    );
  }

  async start() {
    if (this.isMining) {
      return;
    }

    try {
      // Clear any previous error when starting
      this.stats.errorMessage = null;
      if (this.onStatsUpdate) {
        this.onStatsUpdate({ ...this.stats });
      }
      
      await this.initialize();
      this.isMining = true;
      this.startTime = Date.now();
      this.totalHashes = 0;
      this.gpuTotalHashes = 0;
      this.solutionsFound = 0;
      this.tokensMinted = 0;
      this.failedSolutions = 0;
      this.enigma23Count = 0;
      this.erisFavorCount = 0;
      this.discordianBlessingCount = 0;
      this.discordantMineCount = 0;
      this.neutralMineCount = 0;
      this.stats.isMining = true;

      // Reset displayed stats when starting
      this.stats.hashesPerSecond = 0;
      this.stats.totalHashes = 0;
      this.stats.solutionsFound = 0;
      this.stats.tokensMinted = 0;
      this.stats.failedSolutions = 0;
      this.stats.enigma23Count = 0;
      this.stats.erisFavorCount = 0;
      this.stats.discordianBlessingCount = 0;
      this.stats.discordantMineCount = 0;
      this.stats.neutralMineCount = 0;
      this.stats.gpuHashesPerSecond = 0;
      this.stats.gpuTotalHashes = 0;
      this.stats.gpuEnabled = this.settings.gpu_mining_enabled || false;
      this.stats.solutionFound = false;
      this.stats.isSubmitting = false;
      this.stats.pendingSolutions = 0;
      if (this.onStatsUpdate) {
        this.onStatsUpdate({ ...this.stats });
      }

      this.log('success', 'Mining started');
      
      // Start queue processor in parallel (handles solution submissions with rate limiting)
      this.processSolutionQueue();
      
      // Start mining loop (workers continuously mine and add solutions to queue)
      this.mine();
    } catch (error: any) {
      this.log('error', `Failed to start mining: ${error.message}`);
      this.isMining = false;
      this.stats.isMining = false;
    }
  }

  async stop() {
    // Set flag first to signal loops to exit
    this.isMining = false;
    this.isSubmitting = false;
    this.stats.isMining = false;
    
    // Stop all CPU workers immediately
    this.workers.forEach((worker) => {
      worker.postMessage({ stop: true });
      worker.terminate();
    });
    this.workers = [];
    this.workerHashes.clear();
    
    // Stop all GPU workers
    this.gpuWorkers.forEach((worker) => {
      worker.postMessage({ stop: true });
      worker.terminate();
    });
    this.gpuWorkers = [];
    this.gpuWorkerHashes.clear();
    
    // Clear solution queue
    this.solutionQueue = [];
    this.isProcessingQueue = false;
    
    // Wait a bit for loops to check the flag and exit
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    // Reset stats when stopping so UI toggles off cleanly
      this.startTime = 0;
      this.totalHashes = 0;
      this.gpuTotalHashes = 0;
      this.solutionsFound = 0;
      this.tokensMinted = 0;
      this.failedSolutions = 0;
      this.enigma23Count = 0;
      this.erisFavorCount = 0;
      this.discordianBlessingCount = 0;
      this.discordantMineCount = 0;
      this.neutralMineCount = 0;
      this.stats.hashesPerSecond = 0;
      this.stats.totalHashes = 0;
      this.stats.solutionsFound = 0;
      this.stats.tokensMinted = 0;
      this.stats.failedSolutions = 0;
      this.stats.enigma23Count = 0;
      this.stats.erisFavorCount = 0;
      this.stats.discordianBlessingCount = 0;
      this.stats.discordantMineCount = 0;
      this.stats.neutralMineCount = 0;
      this.stats.gpuHashesPerSecond = 0;
      this.stats.gpuTotalHashes = 0;
      this.stats.gpuEnabled = false;
      this.stats.solutionFound = false;
      this.stats.isSubmitting = false;
      this.stats.pendingSolutions = 0;
    // Don't clear errorMessage here - let user see it
    if (this.onStatsUpdate) {
      this.onStatsUpdate({ ...this.stats });
    }
    
    this.log('info', 'Mining stopped');
  }

  /**
   * Add solution to queue, preventing duplicates and managing queue for current challenge
   * Only caps queue if there's already a solution for the current challenge
   */
  private addSolutionToQueue(nonce: string, workerId: number, challenge: string): boolean {
    // Prevent exact duplicate nonces
    const isDuplicate = this.solutionQueue.some(s => s.nonce === nonce);
    if (isDuplicate) {
      this.log('info', `Duplicate solution (nonce: ${nonce}) already in queue, skipping`);
      return false;
    }
    
    // Check if there's already a solution for this challenge in the queue
    const hasSolutionForChallenge = this.solutionQueue.some(s => 
      s.challenge.toLowerCase() === challenge.toLowerCase()
    );
    
    if (hasSolutionForChallenge) {
      // There's already a solution for this challenge - drop the oldest one for this challenge
      // to make room, but keep solutions for other challenges
      const challengeIndex = this.solutionQueue.findIndex(s => 
        s.challenge.toLowerCase() === challenge.toLowerCase()
      );
      if (challengeIndex >= 0) {
        const dropped = this.solutionQueue.splice(challengeIndex, 1)[0];
        this.log('info', `Solution for current challenge already in queue. Dropping older solution (nonce: ${dropped.nonce}) to make room for new one.`);
      }
    }
    
    // Add the new solution
    this.solutionQueue.push({ nonce, workerId, challenge });
    return true;
  }

  /**
   * Process solution queue with rate limiting
   * This runs in parallel with mining, submitting solutions one at a time
   */
  private async processSolutionQueue() {
    if (this.isProcessingQueue) {
      return; // Already processing
    }
    
    this.isProcessingQueue = true;
    
    while (this.isMining) {
      if (this.solutionQueue.length === 0) {
        // No solutions to process, wait a bit
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      
      // Get next solution from queue
      const solution = this.solutionQueue.shift();
      if (!solution) continue;
      
      // Update pending count before processing
      this.stats.pendingSolutions = this.solutionQueue.length;
      
      // Set submission flag for UI
      this.isSubmitting = true;
      this.stats.isSubmitting = true;
      // solutionFound should reflect if there are solutions (already set when solution was found)
      // Keep it true if there are more solutions, or if this is the first one being processed
      this.stats.solutionFound = true;
      if (this.onStatsUpdate) {
        this.onStatsUpdate({ ...this.stats });
      }
      
      const queueSize = this.solutionQueue.length;
      this.log('info', `Processing solution from queue (${queueSize} remaining)...`);
      
      // Wrap entire processing in try-finally to ensure indicators are always cleared
      // even when solutions are skipped
      // CRITICAL: Always process receipt completely, even when queue is long
      try {
        // Validate solution before submission - check if challenge is still current
        let shouldSkip = false;
        try {
          if (!this.contract || !this.provider) {
            this.log('warn', 'Contract or provider not available, skipping solution');
            shouldSkip = true;
          } else {
            const chainRpcs = await window.electronAPI.readRpcs();
            if (!chainRpcs || !chainRpcs[this.settings.selected_chain_id]) {
              this.log('warn', 'RPCs not available, skipping solution');
              shouldSkip = true;
            } else {
              let provider = this.provider;
              try {
                provider = await this.rpcManager.getProvider(
                  this.settings.selected_chain_id,
                  chainRpcs[this.settings.selected_chain_id]
                );
              } catch (error) {
                await this.rpcManager.switchToNextRpc(
                  this.settings.selected_chain_id,
                  chainRpcs[this.settings.selected_chain_id]
                );
                provider = await this.rpcManager.getProvider(
                  this.settings.selected_chain_id,
                  chainRpcs[this.settings.selected_chain_id]
                );
              }
              
              const contractAddress = await this.getContractAddress();
              const contractWithProvider = new ethers.Contract(
                contractAddress,
                ERC918_ABI,
                provider
              );
              
              // Fetch current challenge from contract
              const currentChallenge = await contractWithProvider.getChallengeNumber();
              const currentChallengeHex = ethers.hexlify(currentChallenge);
              
              // If solution's challenge doesn't match current challenge, skip it
              if (solution.challenge.toLowerCase() !== currentChallengeHex.toLowerCase()) {
                this.log('warn', `Solution challenge mismatch (queued: ${solution.challenge.substring(0, 10)}..., current: ${currentChallengeHex.substring(0, 10)}...), skipping stale solution`);
                shouldSkip = true;
              }
            }
          }
        } catch (error: any) {
          this.log('warn', `Failed to validate solution challenge: ${error.message}, skipping solution`);
          shouldSkip = true;
        }
        
        // If validation failed, skip submission but continue processing queue
        if (shouldSkip) {
          // Count as failed solution
          this.failedSolutions++;
          this.stats.failedSolutions = this.failedSolutions;
          this.updateStats();
        } else {
          // Submit the solution
          try {
            const submitted = await this.submitSolution(BigInt(solution.nonce), solution.challenge);
            if (submitted) {
              // Stats are already updated in submitSolution() when mint event is found
              // But update again here to ensure UI reflects latest state
              this.updateStats();
              this.log('success', 'Solution submitted successfully');
              
              // Refresh challenge and notify all workers, but don't let it block queue processing
              // Use a fire-and-forget approach to prevent blocking when queue is long
              this.refreshChallengeAndNotifyWorkers().catch((error: any) => {
                this.log('warn', `Failed to refresh challenge after submission: ${error.message}`);
              });
            } else {
              // Submission failed (non-fatal error like "Already rewarded")
              this.failedSolutions++;
              this.stats.failedSolutions = this.failedSolutions;
              this.updateStats();
              // Error occurred, miner may have been stopped
              if (!this.isMining) {
                break;
              }
            }
          } catch (error: any) {
            // Submission error - count as failed
            this.failedSolutions++;
            this.stats.failedSolutions = this.failedSolutions;
            this.updateStats();
            this.log('error', `Failed to submit queued solution: ${error.message}`);
            // If error stops the miner, exit
            if (!this.isMining) {
              break;
            }
          }
        }
      } finally {
        // Always clear submission flags and update pending count, even if solution was skipped
        this.isSubmitting = false;
        this.stats.isSubmitting = false;
        this.stats.pendingSolutions = this.solutionQueue.length;
        
        // Clear solutionFound flag if no more solutions in queue
        // Otherwise keep it true to show there are still solutions pending
        if (this.solutionQueue.length === 0) {
          this.stats.solutionFound = false;
        } else {
          // Keep solutionFound true if there are more solutions waiting
          this.stats.solutionFound = true;
        }
        
        if (this.onStatsUpdate) {
          this.onStatsUpdate({ ...this.stats });
        }
      }
      
      // Apply rate limiting between submissions
      if (this.isMining && this.settings.submission_rate_limit_ms > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.settings.submission_rate_limit_ms));
      }
      
      // Small delay even if rate limiting is disabled, but shorter to process queue faster
      if (this.isMining) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    
    this.isProcessingQueue = false;
  }

  /**
   * Immediately refresh challenge from contract and notify all workers.
   * Called after a successful solution submission to minimize stale solutions.
   */
  private async refreshChallengeAndNotifyWorkers(): Promise<void> {
    if (!this.contract || !this.isMining) return;
    
    try {
      // Fetch new challenge from contract
      const challenge = await this.contract.getChallengeNumber();
      const target = await this.contract.getMiningTarget();
      
      // Update stats with new challenge
      this.stats.currentChallenge = challenge;
      
      // Notify all CPU workers
      for (let i = 0; i < this.workers.length; i++) {
        this.workers[i].postMessage({
          challenge,
          address: this.settings.mining_account_public_address,
          target: target.toString(),
          workerId: i,
        });
      }
      
      // Notify all GPU workers (they will recreate pipeline with new challenge)
      for (let i = 0; i < this.gpuWorkers.length; i++) {
        this.gpuWorkers[i].postMessage({
          challenge,
          address: this.settings.mining_account_public_address,
          target: target.toString(),
          workerId: i,
          workgroupSize: this.settings.gpu_workgroup_size || 256,
          workgroupCount: this.settings.gpu_workgroup_count || 4096,
        });
      }
      
      this.log('info', `Challenge refreshed: ${challenge.substring(0, 10)}...`);
    } catch (error: any) {
      // Non-fatal - the main mine loop will refresh eventually
      this.log('warn', `Failed to refresh challenge after submission: ${error.message}`);
    }
  }

  private async mine() {
    while (this.isMining) {
      try {
        // Check flag before each operation
        if (!this.isMining) break;
        
        // Yield to event loop before starting to prevent blocking
        await new Promise((resolve) => setTimeout(resolve, 0));
        
        // Check flag again after yield
        if (!this.isMining) break;
        
        // Fetch current contract state
        const { challenge, difficulty, reward } = await this.fetchContractData();
        this.stats.currentChallenge = challenge;
        this.stats.currentDifficulty = difficulty;
        this.stats.currentReward = reward;

        // Check flag before continuing
        if (!this.isMining) break;
        
        // Get mining target
        if (!this.contract || !this.provider) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (!this.isMining) break;
          continue;
        }

        const chainRpcs = await window.electronAPI.readRpcs();
        if (!chainRpcs || !chainRpcs[this.settings.selected_chain_id]) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (!this.isMining) break;
          continue;
        }

        let provider = this.provider;
        try {
          provider = await this.rpcManager.getProvider(
            this.settings.selected_chain_id,
            chainRpcs[this.settings.selected_chain_id]
          );
        } catch (error) {
          // Auto-switch to next RPC when rate limited
          await this.rpcManager.switchToNextRpc(
            this.settings.selected_chain_id,
            chainRpcs[this.settings.selected_chain_id]
          );
          provider = await this.rpcManager.getProvider(
            this.settings.selected_chain_id,
            chainRpcs[this.settings.selected_chain_id]
          );
        }

        const contractAddress = await this.getContractAddress();
        const contractWithProvider = new ethers.Contract(
          contractAddress,
          ERC918_ABI,
          provider
        );

        const target = await contractWithProvider.getMiningTarget();

        // Mine with multiple threads using Web Workers for true parallelism
        // Workers will continuously mine and add solutions to queue
        const threads = this.settings.cpu_thread_count;
        
        // Only create CPU workers if they don't exist
        if (this.workers.length === 0) {
          // Create Web Workers for true parallel processing
          // Workers will continuously mine and add solutions to queue
          for (let i = 0; i < threads; i++) {
            const worker = this.createWorker();
            this.workers.push(worker);
            this.workerHashes.set(i, 0);
            
            // Set up worker message handler - no promises, just handle messages
            worker.onmessage = (e: MessageEvent) => {
              const { type, workerId, nonce, hashesProcessed, challenge: solutionChallenge } = e.data;
              
              if (type === 'progress') {
                // Update hash count for this worker
                this.workerHashes.set(workerId, hashesProcessed);
                // Update total hashes (sum of all workers)
                this.totalHashes = Array.from(this.workerHashes.values()).reduce((sum, count) => sum + count, 0);
                this.updateStats();
              } else if (type === 'solution') {
                // Solution found! Add to queue and continue mining
                const solutionChallengeValue = solutionChallenge || challenge;
                const added = this.addSolutionToQueue(nonce, workerId, solutionChallengeValue);
                
                if (added) {
                  this.log('success', `Solution found by CPU worker ${workerId}! Nonce: ${nonce} (queued for submission)`);
                  
                  // Update stats to show solution found and pending count
                  this.stats.solutionFound = true;
                  this.stats.pendingSolutions = this.solutionQueue.length;
                  if (this.onStatsUpdate) {
                    this.onStatsUpdate({ ...this.stats });
                  }
                }
                
                // Workers keep mining continuously - no pause/resume needed
              } else if (type === 'stopped') {
                // Worker stopped
              }
            };
            
            worker.onerror = (error) => {
              this.log('error', `CPU Worker ${i} error: ${error.message}`);
            };
          }
          
          this.log('info', `Started ${threads} CPU mining worker(s) for true parallel processing`);
        }
        
        // Create GPU workers if GPU mining is enabled
        if (this.settings.gpu_mining_enabled && this.gpuWorkers.length === 0) {
          try {
            // Create a single GPU worker (can be extended to support multiple GPUs)
            const gpuWorker = this.createGPUWorker();
            this.gpuWorkers.push(gpuWorker);
            this.gpuWorkerHashes.set(0, 0);
            
            // Set up GPU worker message handler
            gpuWorker.onmessage = (e: MessageEvent) => {
              const { type, workerId, nonce, hashesProcessed, challenge: solutionChallenge, message } = e.data;
              
              if (type === 'progress') {
                // Update GPU hash count
                this.gpuWorkerHashes.set(workerId, hashesProcessed);
                this.gpuTotalHashes = Array.from(this.gpuWorkerHashes.values()).reduce((sum, count) => sum + count, 0);
                this.updateStats();
              } else if (type === 'solution') {
                // Solution found by GPU! Add to queue
                const solutionChallengeValue = solutionChallenge || challenge;
                const added = this.addSolutionToQueue(nonce, 1000 + workerId, solutionChallengeValue);
                
                if (added) {
                  this.log('success', `Solution found by GPU worker ${workerId}! Nonce: ${nonce} (queued for submission)`);
                  
                  this.stats.solutionFound = true;
                  this.stats.pendingSolutions = this.solutionQueue.length;
                  if (this.onStatsUpdate) {
                    this.onStatsUpdate({ ...this.stats });
                  }
                }
              } else if (type === 'info') {
                this.log('info', `GPU Worker: ${message}`);
              } else if (type === 'error') {
                this.log('error', `GPU Worker error: ${message}`);
              } else if (type === 'stopped') {
                // GPU worker stopped
              }
            };
            
            gpuWorker.onerror = (error) => {
              this.log('error', `GPU Worker error: ${error.message}`);
            };
            
            this.log('info', 'GPU mining worker created');
            this.stats.gpuEnabled = true;
          } catch (error: any) {
            this.log('error', `Failed to create GPU worker: ${error.message}`);
            this.stats.gpuEnabled = false;
          }
        }
        
        // Update existing CPU workers with new challenge/target (if challenge changed)
        // This allows workers to continue mining with updated parameters without resetting hash counts
        for (let i = 0; i < this.workers.length; i++) {
          this.workers[i].postMessage({
            challenge,
            address: this.settings.mining_account_public_address,
            target: target.toString(),
            workerId: i,
          });
        }
        
        // Update GPU workers with new challenge/target
        for (let i = 0; i < this.gpuWorkers.length; i++) {
          this.gpuWorkers[i].postMessage({
            challenge,
            address: this.settings.mining_account_public_address,
            target: target.toString(),
            workerId: i,
            workgroupSize: this.settings.gpu_workgroup_size || 256,
            workgroupCount: this.settings.gpu_workgroup_count || 4096,
          });
        }
        
        // Keep workers running and periodically refresh challenge
        // Workers will continuously mine and add solutions to queue
        // Check flag periodically and break if stopped
        for (let i = 0; i < 30 && this.isMining; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Check every second
        }
        
        // Update stats after mining attempt
        this.updateStats();
      } catch (error: any) {
        this.log('error', `Mining error: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  // Note: generateRandomNonce() and mineRandom() methods removed
  // Now using Web Workers for true parallelism - workers handle nonce generation and hashing internally

  private updateStats() {
    // Don't update stats if mining is stopped (prevents overwriting stopped state)
    if (!this.isMining && !this.stats.isMining) {
      return;
    }
    
    const elapsed = (Date.now() - this.startTime) / 1000;
    // Calculate combined hashrate (CPU + GPU)
    const combinedTotalHashes = this.totalHashes + this.gpuTotalHashes;
    this.stats.hashesPerSecond = elapsed > 0 ? combinedTotalHashes / elapsed : 0;
    this.stats.totalHashes = combinedTotalHashes;
    this.stats.gpuHashesPerSecond = elapsed > 0 ? this.gpuTotalHashes / elapsed : 0;
    this.stats.gpuTotalHashes = this.gpuTotalHashes;
    this.stats.solutionsFound = this.solutionsFound;
    this.stats.tokensMinted = this.tokensMinted;
    this.stats.failedSolutions = this.failedSolutions;
    this.stats.enigma23Count = this.enigma23Count;
    this.stats.erisFavorCount = this.erisFavorCount;
    this.stats.discordianBlessingCount = this.discordianBlessingCount;
    this.stats.discordantMineCount = this.discordantMineCount;
    this.stats.neutralMineCount = this.neutralMineCount;
    this.stats.gpuEnabled = this.settings.gpu_mining_enabled || false;
    
    // Ensure isMining flag matches internal state
    this.stats.isMining = this.isMining;

    if (this.onStatsUpdate) {
      this.onStatsUpdate({ ...this.stats });
    }
  }

  getStats(): MiningStats {
    return { ...this.stats };
  }
}


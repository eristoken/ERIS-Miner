// Mining Web Worker - runs in separate thread for true parallelism
import { keccak256 } from 'ethers';

// Generate random nonce (64-bit, 8 bytes)
function generateRandomNonce(): bigint {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let nonce = BigInt(0);
  for (let i = 0; i < 8; i++) {
    nonce = (nonce << BigInt(8)) | BigInt(bytes[i]);
  }
  return nonce;
}

// Hash function matching the main thread implementation
function hash(challenge: string, address: string, nonce: bigint): bigint {
  // Match FTIC-Miner's exact method: keccak256(challenge_number + hashingEthAddress.substring(2) + solution_number.substring(2))
  const addressHex = address.startsWith('0x') ? address.substring(2) : address;
  const nonceHex = nonce.toString(16).padStart(64, '0');
  const concatenated = challenge + addressHex + nonceHex;
  
  // Use ethers.keccak256 which matches the main thread exactly
  const hashHex = keccak256(concatenated);
  return BigInt(hashHex);
}

let shouldStop = false;
let currentChallenge: string = '';
let currentAddress: string = '';
let currentTarget: bigint = BigInt(0);
let workerId: number = 0;
let miningLoop: Promise<void> | null = null;

self.onmessage = function(e: MessageEvent) {
  const { challenge, address, target, workerId: id, stop } = e.data;
  
  if (stop) {
    shouldStop = true;
    self.postMessage({ type: 'stopped', workerId: id });
    return;
  }
  
  // Store mining parameters and start/restart mining loop
  currentChallenge = challenge;
  currentAddress = address;
  currentTarget = BigInt(target);
  workerId = id;
  shouldStop = false;
  
  // If mining loop is already running, just update parameters (it will pick up new values)
  // Don't restart the loop - this preserves the hashesProcessed counter
  if (miningLoop) {
    return; // Parameters updated, loop will use new values on next iteration
  }
  
  let hashesProcessed = 0;
  const reportInterval = 10000; // Report hashes every 10k
  
  // Mining loop - runs continuously, doesn't stop when solution is found
  miningLoop = (async function mineLoop() {
    while (!shouldStop) {
      // Generate random nonce and hash (uses currentChallenge, currentAddress, currentTarget)
      const nonce = generateRandomNonce();
      const hashValue = hash(currentChallenge, currentAddress, nonce);
      hashesProcessed++;
      
      // Report progress periodically
      if (hashesProcessed % reportInterval === 0) {
        self.postMessage({ type: 'progress', workerId, hashesProcessed });
      }
      
      // Check if solution found - add to queue and continue mining
      if (hashValue <= currentTarget) {
        self.postMessage({ 
          type: 'solution', 
          workerId, 
          nonce: nonce.toString(), 
          hashesProcessed,
          challenge: currentChallenge
        });
        // Continue mining - don't return, keep looking for more solutions
      }
      
      // Yield to event loop periodically to check for messages
      if (hashesProcessed % 1000 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    miningLoop = null;
  })();
};


import { ethers } from 'ethers';
import { RpcEndpoint } from '../types';

export class RpcManager {
  private providers: Map<string, ethers.JsonRpcProvider> = new Map();
  private currentRpcIndex: Map<string, number> = new Map();
  private rateLimiters: Map<string, number> = new Map();
  private lastCallTime: Map<string, number> = new Map();
  private rateLimitMs: number;
  private switchDelayMs: number;
  private onRpcSwitch?: (chainId: string, newRpc: RpcEndpoint) => void;

  constructor(rateLimitMs: number = 200, switchDelayMs: number = 20000) {
    this.rateLimitMs = rateLimitMs;
    this.switchDelayMs = switchDelayMs;
  }

  setOnRpcSwitch(callback: (chainId: string, newRpc: RpcEndpoint) => void) {
    this.onRpcSwitch = callback;
  }

  setRateLimit(ms: number) {
    this.rateLimitMs = ms;
  }

  setSwitchDelay(ms: number) {
    this.switchDelayMs = ms;
  }

  async initializeRpcs(chainId: string, rpcs: RpcEndpoint[]) {
    if (rpcs.length === 0) {
      throw new Error(`No RPCs configured for chain ${chainId}`);
    }

    // Clear existing providers for this chain
    this.providers.delete(chainId);
    this.currentRpcIndex.set(chainId, 0);

    // Initialize providers
    for (const rpc of rpcs) {
      const key = `${chainId}:${rpc.url}`;
      this.providers.set(key, new ethers.JsonRpcProvider(rpc.url));
    }
  }

  private async waitForRateLimit(chainId: string, rpcUrl: string): Promise<void> {
    if (this.rateLimitMs === 0) {
      return;
    }

    const key = `${chainId}:${rpcUrl}`;
    const lastCall = this.lastCallTime.get(key) || 0;
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall < this.rateLimitMs) {
      const waitTime = this.rateLimitMs - timeSinceLastCall;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastCallTime.set(key, Date.now());
  }

  async getProvider(chainId: string, rpcs: RpcEndpoint[]): Promise<ethers.JsonRpcProvider> {
    if (rpcs.length === 0) {
      throw new Error(`No RPCs configured for chain ${chainId}`);
    }

    const currentIndex = this.currentRpcIndex.get(chainId) || 0;
    const currentRpc = rpcs[currentIndex];
    const key = `${chainId}:${currentRpc.url}`;
    const provider = this.providers.get(key);

    if (!provider) {
      throw new Error(`Provider not initialized for ${key}`);
    }

    await this.waitForRateLimit(chainId, currentRpc.url);

    return provider;
  }

  async switchToNextRpc(chainId: string, rpcs: RpcEndpoint[]): Promise<void> {
    if (rpcs.length <= 1) {
      return; // No alternative RPCs available
    }

    const currentIndex = this.currentRpcIndex.get(chainId) || 0;
    const nextIndex = (currentIndex + 1) % rpcs.length;
    this.currentRpcIndex.set(chainId, nextIndex);

    const newRpc = rpcs[nextIndex];
    if (this.onRpcSwitch) {
      this.onRpcSwitch(chainId, newRpc);
    }

    // Wait for switch delay
    await new Promise((resolve) => setTimeout(resolve, this.switchDelayMs));
  }

  getCurrentRpc(chainId: string, rpcs: RpcEndpoint[]): RpcEndpoint {
    const currentIndex = this.currentRpcIndex.get(chainId) || 0;
    return rpcs[currentIndex];
  }
}


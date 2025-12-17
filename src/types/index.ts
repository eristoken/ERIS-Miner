export interface Settings {
  mining_account_public_address: string;
  mining_account_private_key: string;
  network_type: 'mainnet' | 'testnet';
  gas_price_gwei: number;
  priority_gas_fee_gwei: number;
  gas_limit: number;
  cpu_thread_count: number;
  rpc_rate_limit_ms: number;
  rpc_switch_delay_seconds: number;
  selected_chain_id: string;
}

export interface Contract {
  name: string;
  address: string;
}

export interface Contracts {
  mainnet: Contract;
  testnet: Contract;
}

export interface Chain {
  name: string;
  chainId: number;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface RpcEndpoint {
  url: string;
  name: string;
}

export interface MiningStats {
  hashesPerSecond: number;
  totalHashes: number;
  solutionsFound: number;
  tokensMinted: number;
  currentChallenge: string;
  currentDifficulty: string;
  currentReward: string;
  isMining: boolean;
  solutionFound: boolean;
  isSubmitting: boolean;
}

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

declare global {
  interface Window {
    electronAPI: {
      readSettings: () => Promise<Settings | null>;
      writeSettings: (settings: Settings) => Promise<boolean>;
      readChains: () => Promise<Record<string, Chain> | null>;
      writeChains: (chains: Record<string, Chain>) => Promise<boolean>;
      readRpcs: () => Promise<Record<string, RpcEndpoint[]> | null>;
      writeRpcs: (rpcs: Record<string, RpcEndpoint[]>) => Promise<boolean>;
      readContracts: () => Promise<Contracts | null>;
    };
  }
}


// Separate file to avoid react-refresh warning
// This file exports non-component functions

// Import shared miner to clear errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharedMinerRef: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setSharedMinerRef(miner: any) {
  sharedMinerRef = miner;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSharedMinerRef(): any {
  return sharedMinerRef;
}


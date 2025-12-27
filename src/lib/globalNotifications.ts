import { RewardTier } from '../types';

// Global notification manager that can be accessed from anywhere
// This allows the miner to trigger notifications even when Home component is not mounted
let globalNotificationHandlers: {
  showToast?: (message: string, severity: 'success' | 'error' | 'info' | 'warning') => void;
  showTierNotification?: (tier: RewardTier, reward: string) => void;
  showJackpot?: (reward: string) => void;
} = {};

export function setGlobalNotificationHandlers(handlers: typeof globalNotificationHandlers) {
  globalNotificationHandlers = handlers;
}

export function showGlobalToast(message: string, severity: 'success' | 'error' | 'info' | 'warning') {
  if (globalNotificationHandlers.showToast) {
    globalNotificationHandlers.showToast(message, severity);
  }
}

export function showGlobalTierNotification(tier: RewardTier, reward: string) {
  if (globalNotificationHandlers.showTierNotification) {
    globalNotificationHandlers.showTierNotification(tier, reward);
  }
}

export function showGlobalJackpot(reward: string) {
  if (globalNotificationHandlers.showJackpot) {
    globalNotificationHandlers.showJackpot(reward);
  }
}


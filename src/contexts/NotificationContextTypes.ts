// Separate file for context exports to avoid react-refresh warning
import { createContext } from 'react';
import { RewardTier } from '../types';

export interface NotificationContextType {
  showToast: (message: string, severity: 'success' | 'error' | 'info' | 'warning') => void;
  showTierNotification: (tier: RewardTier, reward: string) => void;
  showJackpot: (reward: string) => void;
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);


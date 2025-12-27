import { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { Snackbar, Alert, Dialog, DialogContent } from '@mui/material';
import { RewardTier } from '../types';
import Enigma23Jackpot from '../components/Enigma23Jackpot';
import { setGlobalNotificationHandlers } from '../lib/globalNotifications';

// Import shared miner to clear errors
// @ts-ignore - We need to access the shared miner from Home.tsx
// This is a workaround since we can't easily pass the clear function through context
let sharedMinerRef: any = null;

export function setSharedMinerRef(miner: any) {
  sharedMinerRef = miner;
}

interface NotificationContextType {
  showToast: (message: string, severity: 'success' | 'error' | 'info' | 'warning') => void;
  showTierNotification: (tier: RewardTier, reward: string) => void;
  showJackpot: (reward: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  // Toast state
  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  // Tier notification state
  const [tierNotification, setTierNotification] = useState<{
    open: boolean;
    tier: RewardTier;
    reward: string;
  }>({
    open: false,
    tier: null,
    reward: '0',
  });

  // Enigma23 Jackpot state
  const [showJackpot, setShowJackpot] = useState(false);
  const [jackpotReward, setJackpotReward] = useState('0');

  // Track previous submission state to detect changes
  const prevIsSubmittingRef = useRef<boolean | null>(null);

  const showToast = (message: string, severity: 'success' | 'error' | 'info' | 'warning') => {
    setToast({
      open: true,
      message,
      severity,
    });
  };

  const showTierNotification = (tier: RewardTier, reward: string) => {
    setTierNotification({
      open: true,
      tier,
      reward,
    });
  };

  const showJackpotNotification = (reward: string) => {
    setJackpotReward(reward);
    setShowJackpot(true);
  };

  // Register global notification handlers so miner can trigger notifications from anywhere
  useEffect(() => {
    setGlobalNotificationHandlers({
      showToast,
      showTierNotification,
      showJackpot: showJackpotNotification,
    });

    // Cleanup on unmount
    return () => {
      setGlobalNotificationHandlers({});
    };
  }, []);

  // Global stats watcher - monitors submission state to show notifications on all tabs
  useEffect(() => {
    // Poll miner stats to detect submission state changes
    // This works regardless of which tab is active
    const statsPollInterval = setInterval(() => {
      if (sharedMinerRef) {
        const stats = sharedMinerRef.getStats();
        const prevIsSubmitting = prevIsSubmittingRef.current;
        
        // Initialize on first check
        if (prevIsSubmitting === null) {
          prevIsSubmittingRef.current = stats.isSubmitting;
          return;
        }
        
        // Detect when submission starts (false -> true)
        if (stats.isSubmitting && !prevIsSubmitting) {
          showToast('⏳ Submitting solution to blockchain...', 'info');
        }
        
        prevIsSubmittingRef.current = stats.isSubmitting;
      }
    }, 500); // Check every 500ms

    return () => clearInterval(statsPollInterval);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        showToast,
        showTierNotification,
        showJackpot: showJackpotNotification,
      }}
    >
      {children}

      {/* Toast Notifications */}
      <Snackbar
        open={toast.open}
        autoHideDuration={toast.severity === 'error' ? 6000 : 3000}
        onClose={() => {
          setToast({ ...toast, open: false });
          // Clear error when error toast is closed
          if (toast.severity === 'error' && toast.message.startsWith('⚠️') && sharedMinerRef) {
            const currentStats = sharedMinerRef.getStats();
            if (currentStats.errorMessage) {
              currentStats.errorMessage = null;
              const minerWithCallback = sharedMinerRef as any;
              if (minerWithCallback.onStatsUpdate) {
                minerWithCallback.onStatsUpdate({ ...currentStats });
              }
            }
          }
        }}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ maxWidth: '90vw' }}
      >
        <Alert
          onClose={() => {
            setToast({ ...toast, open: false });
            // Clear error when error toast is closed
            if (toast.severity === 'error' && toast.message.startsWith('⚠️') && sharedMinerRef) {
              const currentStats = sharedMinerRef.getStats();
              if (currentStats.errorMessage) {
                currentStats.errorMessage = null;
                const minerWithCallback = sharedMinerRef as any;
                if (minerWithCallback.onStatsUpdate) {
                  minerWithCallback.onStatsUpdate({ ...currentStats });
                }
              }
            }
          }}
          severity={toast.severity}
          sx={{
            width: '100%',
            maxWidth: '90vw',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            '& .MuiAlert-message': {
              overflowWrap: 'break-word',
              wordBreak: 'break-word',
            },
          }}
        >
          {toast.message}
        </Alert>
      </Snackbar>

      {/* Tier Notification */}
      <Snackbar
        open={tierNotification.open}
        autoHideDuration={5000}
        onClose={() => setTierNotification({ ...tierNotification, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setTierNotification({ ...tierNotification, open: false })}
          severity="success"
          sx={{
            width: '100%',
            fontSize: '1.1rem',
            fontWeight: 'bold',
          }}
        >
          {tierNotification.tier === 'ErisFavor' && '⭐ '}
          {tierNotification.tier === 'DiscordianBlessing' && '✨ '}
          {tierNotification.tier === 'DiscordantMine' && '⚡ '}
          {tierNotification.tier === 'NeutralMine' && '⚪ '}
          {tierNotification.tier === 'ErisFavor'
            ? 'Eris Favor'
            : tierNotification.tier === 'DiscordianBlessing'
            ? 'Discordian Blessing'
            : tierNotification.tier === 'DiscordantMine'
            ? 'Discordant Mine'
            : tierNotification.tier === 'NeutralMine'
            ? 'Neutral Mine'
            : 'Tier'}{' '}
          Tier Awarded! Reward: {tierNotification.reward} tokens
        </Alert>
      </Snackbar>

      {/* Enigma23 Jackpot Dialog */}
      <Dialog
        open={showJackpot}
        onClose={() => setShowJackpot(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            border: '3px solid gold',
            boxShadow: '0 0 30px rgba(255, 215, 0, 0.5)',
          },
        }}
      >
        <DialogContent sx={{ p: 0 }}>
          <Enigma23Jackpot reward={jackpotReward} onClose={() => setShowJackpot(false)} />
        </DialogContent>
      </Dialog>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}


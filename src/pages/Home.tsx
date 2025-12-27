import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Paper,
  CircularProgress,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { Miner } from '../lib/miner';
import { RpcManager } from '../lib/rpcManager';
import { Settings, MiningStats, Chain } from '../types';
import { addLog } from './Console';
import { showGlobalTierNotification, showGlobalJackpot, showGlobalToast } from '../lib/globalNotifications';
import { setSharedMinerRef } from '../contexts/NotificationContext';
// @ts-ignore - Image import
import erisBanner from '../../eris_app_banner.png';

// Shared miner and RPC manager instances so mining state persists
// across route/tab changes.
let sharedMiner: Miner | null = null;
let sharedRpcManager: RpcManager | null = null;

// Track dismissed error messages across component remounts
const dismissedErrors = new Set<string>();

export default function Home() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [chains, setChains] = useState<Record<string, Chain>>({});
  
  // Initialize stats from shared miner if it exists (mining continues across navigation)
  const getInitialStats = (): MiningStats => {
    if (sharedMiner) {
      return sharedMiner.getStats();
    }
    return {
      hashesPerSecond: 0,
      totalHashes: 0,
      solutionsFound: 0,
      tokensMinted: 0,
      failedSolutions: 0,
      pendingSolutions: 0,
      currentChallenge: '0x',
      currentDifficulty: '0',
      currentReward: '0',
      isMining: false,
      solutionFound: false,
      isSubmitting: false,
      errorMessage: null,
      lastTier: null,
      enigma23Count: 0,
      erisFavorCount: 0,
      discordianBlessingCount: 0,
      discordantMineCount: 0,
      neutralMineCount: 0,
    };
  };
  
  const [stats, setStats] = useState<MiningStats>(getInitialStats());
  const [miner, setMiner] = useState<Miner | null>(sharedMiner);
  const [loading, setLoading] = useState(true);
  
  // Track previous stats to detect changes for toasts
  const [prevStats, setPrevStats] = useState<MiningStats | null>(null);
  
  // Track if this is the first render after mount
  const isFirstRender = useRef(true);

  // Function to clear error message from miner and mark as dismissed
  const clearErrorMessage = (errorMessage?: string) => {
    const messageToClear = errorMessage || (sharedMiner?.getStats().errorMessage || null);
    
    if (messageToClear) {
      // Mark this error as dismissed
      dismissedErrors.add(messageToClear);
    }
    
    if (sharedMiner) {
      const currentStats = sharedMiner.getStats();
      if (currentStats.errorMessage) {
        currentStats.errorMessage = null;
        // Trigger stats update to reflect the cleared error
        // Access the private callback using type assertion
        const minerWithCallback = sharedMiner as any;
        if (minerWithCallback.onStatsUpdate) {
          minerWithCallback.onStatsUpdate({ ...currentStats });
        }
      }
    }
  };

  useEffect(() => {
    loadSettings();
    
    // If shared miner already exists (mining is running), sync stats immediately
    // This ensures the UI reflects the actual mining state when navigating back to this tab
    if (sharedMiner) {
      const currentStats = sharedMiner.getStats();
      setStats(currentStats);
      setMiner(sharedMiner);
    }
    
    // Cleanup when component unmounts (navigating away)
    // Note: Mining continues in the background - we only clear the error message
    // The shared miner instance persists across navigation, so mining is not interrupted
    return () => {
      if (sharedMiner) {
        const currentStats = sharedMiner.getStats();
        if (currentStats.errorMessage) {
          clearErrorMessage(currentStats.errorMessage);
        }
      }
      // Mining continues running - callbacks are lost but will be rebound when component remounts
    };
  }, []);

  // Handle toast notifications for stats changes
  useEffect(() => {
    // Initialize prevStats on first render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setPrevStats(stats);
      // Don't show errors on first render - they're likely stale from navigation
      return;
    }
    
    // Error toast - show if it's a new error message that hasn't been dismissed
    // Note: Submission notifications are now handled globally in NotificationContext
    // Use global notifications so it shows on any tab
    if (stats.errorMessage) {
      // Show if:
      // 1. The error message changed from previous stats (new error occurred)
      // 2. AND this error hasn't been dismissed by the user
      const isNewError = prevStats && stats.errorMessage !== prevStats.errorMessage;
      const notDismissed = !dismissedErrors.has(stats.errorMessage);
      
      if (isNewError && notDismissed) {
        showGlobalToast(`⚠️ ${stats.errorMessage}`, 'error');
        // Mark error as dismissed when toast is shown (will be cleared when user closes toast)
        // The error will be cleared when the toast is closed via the NotificationContext
      }
    }
    
    // Remove from dismissed set when error is resolved (so new occurrences can show)
    if (!stats.errorMessage && prevStats && prevStats.errorMessage) {
      dismissedErrors.delete(prevStats.errorMessage);
    }
    
    setPrevStats(stats);
  }, [stats, prevStats]);
  
  useEffect(() => {
    if (settings) {
      initializeMiner();
    }
    // We intentionally omit miner from deps to avoid reinitializing
    // when only local state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const loadSettings = async () => {
    try {
      const [loadedSettings, loadedChains] = await Promise.all([
        window.electronAPI.readSettings(),
        window.electronAPI.readChains(),
      ]);
      if (loadedSettings) {
        setSettings(loadedSettings);
      }
      if (loadedChains) {
        setChains(loadedChains);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const initializeMiner = async () => {
    if (!settings) return;

    // Reuse existing shared instances if they exist
    // These persist across navigation, so mining continues even when user navigates to other tabs
    if (!sharedRpcManager) {
      sharedRpcManager = new RpcManager(
        settings.rpc_rate_limit_ms,
        settings.rpc_switch_delay_seconds * 1000
      );
    } else {
      sharedRpcManager.setRateLimit(settings.rpc_rate_limit_ms);
      sharedRpcManager.setSwitchDelay(settings.rpc_switch_delay_seconds * 1000);
    }

    if (!sharedMiner) {
      sharedMiner = new Miner(sharedRpcManager);
    }

    // Always (re)bind callbacks so the current Home instance receives updates
    // When navigating back to this tab, callbacks are rebound to update the UI
    // Mining continues in the background regardless of which tab is active
    sharedMiner.setOnStatsUpdate((updatedStats) => {
      setStats(updatedStats);
    });

    // Set up tier update callback - use global notifications so they show on any tab
    sharedMiner.setOnTierUpdate((tier, reward) => {
      if (tier === 'Enigma23') {
        // Show special jackpot animation
        showGlobalJackpot(reward);
      } else {
        // Show regular tier notification
        showGlobalTierNotification(tier, reward);
      }
    });

    sharedRpcManager.setOnRpcSwitch((chainId, newRpc) => {
      // Load chains if not already loaded
      window.electronAPI.readChains().then((loadedChains) => {
        const chainName = loadedChains?.[chainId]?.name || `Chain ${chainId}`;
        addLog({
          timestamp: new Date(),
          level: 'info',
          message: `Switched to RPC on ${chainName}: ${newRpc.name} (${newRpc.url})`,
        });
      }).catch(() => {
        addLog({
          timestamp: new Date(),
          level: 'info',
          message: `Switched to RPC: ${newRpc.name} (${newRpc.url})`,
        });
      });
    });

    // Ensure local state reflects current miner stats when (re)initializing
    const currentStats = sharedMiner.getStats();
    setStats(currentStats);

    const rpcs = await window.electronAPI.readRpcs();
    if (rpcs) {
      await sharedMiner.updateSettings(settings, rpcs);
    }

    setMiner(sharedMiner);
    
    // Register shared miner with notification context for error clearing
    setSharedMinerRef(sharedMiner);
  };

  const handleStartStop = async () => {
    if (!miner || !settings) return;

    if (stats.isMining) {
      addLog({
        timestamp: new Date(),
        level: 'info',
        message: 'Stopping miner via UI toggle',
      });
      // Stop mining and wait for it to complete
      await miner.stop();
      // Get fresh stats from miner to ensure state is correct
      const stoppedStats = miner.getStats();
      setStats(stoppedStats);
    } else {
      addLog({
        timestamp: new Date(),
        level: 'info',
        message: 'Starting miner via UI toggle',
      });
      await miner.start();
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (!settings) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" color="error">
          Failed to load settings. Please configure settings first.
        </Typography>
      </Paper>
    );
  }

  return (
      <Box>
        <Grid container spacing={3}>
        <Grid item xs={12}>
          {/* Banner Image Container with Cards */}
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              borderRadius: 2,
              overflow: 'hidden',
              boxShadow: 3,
              mb: 3,
            }}
          >
            <Box
              component="img"
              src={erisBanner}
              alt="ERIS Token Banner"
              sx={{
                width: '100%',
                height: 'auto',
                display: 'block',
              }}
            />
            {/* Overlay */}
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                pointerEvents: 'none',
              }}
            />
            
            {/* Mining Control Card - Top of Image */}
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 2,
                p: 2,
              }}
            >
              <Card
                sx={{
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  backdropFilter: 'blur(1px)',
                }}
              >
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Box>
                      <Typography variant="h5">Mining Control</Typography>
                      {settings && chains[settings.selected_chain_id] && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Chain: {chains[settings.selected_chain_id].name} (Chain ID: {settings.selected_chain_id})
                        </Typography>
                      )}
                    </Box>
                    <Button
                      variant="contained"
                      color={stats.isMining ? 'error' : 'primary'}
                      startIcon={stats.isMining ? <StopIcon /> : <PlayArrowIcon />}
                      onClick={handleStartStop}
                      size="large"
                    >
                      {stats.isMining ? 'Stop Mining' : 'Start Mining'}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Box>
            
            {/* Mining Statistics Card - Bottom of Image */}
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 2,
                p: 2,
              }}
            >
              <Card
                sx={{
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  backdropFilter: 'blur(1px)',
                }}
              >
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Mining Statistics (Current Run)
                  </Typography>
                  <Grid container spacing={3} sx={{ mt: 1 }}>
                    <Grid item xs={6} sm={4} md={2.4}>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Hash Rate
                        </Typography>
                        <Typography variant="h5">
                          {(stats.hashesPerSecond / 1000).toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}{' '}
                          kH/s
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2.4}>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Total Hashes
                        </Typography>
                        <Typography variant="h5">
                          {stats.totalHashes.toLocaleString()}
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2.4}>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Solutions Found
                        </Typography>
                        <Typography variant="h5">{stats.solutionsFound}</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2.4}>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Tokens Minted
                        </Typography>
                        <Typography variant="h5">
                          {stats.tokensMinted.toFixed(6)}
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2.4}>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Pending Solutions
                        </Typography>
                        <Typography variant="h5" color={stats.pendingSolutions > 0 ? 'primary' : 'text.primary'}>
                          {stats.pendingSolutions}
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                  <Grid container spacing={3} sx={{ mt: 1 }} alignItems="flex-start">
                    <Grid item xs={6} sm={4} md={2.4}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ minHeight: '2.5em' }}>
                          🎰 Enigma23 Jackpots
                        </Typography>
                        <Typography 
                          variant="h5" 
                          sx={{ 
                            color: stats.enigma23Count > 0 ? 'gold' : 'text.primary',
                            fontWeight: stats.enigma23Count > 0 ? 'bold' : 'normal',
                          }}
                        >
                          {stats.enigma23Count}
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2.4}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ minHeight: '2.5em' }}>
                          ✨ Discordian Blessing
                        </Typography>
                        <Typography 
                          variant="h5" 
                          sx={{ 
                            color: stats.discordianBlessingCount > 0 ? 'success.main' : 'text.primary',
                            fontWeight: stats.discordianBlessingCount > 0 ? 'bold' : 'normal',
                          }}
                        >
                          {stats.discordianBlessingCount}
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2.4}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ minHeight: '2.5em' }}>
                          ⭐ Eris Favor
                        </Typography>
                        <Typography 
                          variant="h5" 
                          sx={{ 
                            color: stats.erisFavorCount > 0 ? 'primary.main' : 'text.primary',
                            fontWeight: stats.erisFavorCount > 0 ? 'bold' : 'normal',
                          }}
                        >
                          {stats.erisFavorCount}
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2.4}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ minHeight: '2.5em' }}>
                          ⚪ Neutral Mine
                        </Typography>
                        <Typography 
                          variant="h5" 
                          sx={{ 
                            color: stats.neutralMineCount > 0 ? 'text.primary' : 'text.secondary',
                            fontWeight: stats.neutralMineCount > 0 ? 'bold' : 'normal',
                          }}
                        >
                          {stats.neutralMineCount}
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2.4}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ minHeight: '2.5em' }}>
                          ⚡ Discordant Mine
                        </Typography>
                        <Typography 
                          variant="h5" 
                          sx={{ 
                            color: stats.discordantMineCount > 0 ? 'warning.main' : 'text.primary',
                            fontWeight: stats.discordantMineCount > 0 ? 'bold' : 'normal',
                          }}
                        >
                          {stats.discordantMineCount}
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Contract Information
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Current Challenge
                </Typography>
                <Typography variant="body1" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {stats.currentChallenge || 'Loading...'}
                </Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Mining Difficulty
                </Typography>
                <Typography variant="h5">
                  {stats.currentDifficulty || '0'}
                </Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Mining Reward
                </Typography>
                <Typography variant="h5">
                  {stats.currentReward || '0'} tokens
                </Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Network
                </Typography>
                <Typography variant="body1" sx={{ textTransform: 'capitalize' }}>
                  {settings.network_type}
                </Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Mining Account
                </Typography>
                <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                  {settings.mining_account_public_address}
                </Typography>
              </Box>
              {stats.lastTier && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Last Reward Tier
                  </Typography>
                  <Typography 
                    variant="h5" 
                    sx={{ 
                      fontWeight: 'bold',
                      color: stats.lastTier === 'Enigma23' ? 'gold' : 
                             stats.lastTier === 'ErisFavor' ? 'primary.main' :
                             stats.lastTier === 'DiscordianBlessing' ? 'success.main' :
                             stats.lastTier === 'DiscordantMine' ? 'warning.main' :
                             'text.primary'
                    }}
                  >
                    {stats.lastTier === 'Enigma23' ? '🎰 ENIGMA23 JACKPOT!' :
                     stats.lastTier === 'ErisFavor' ? '⭐ Eris Favor' :
                     stats.lastTier === 'DiscordianBlessing' ? '✨ Discordian Blessing' :
                     stats.lastTier === 'DiscordantMine' ? '⚡ Discordant Mine' :
                     '⚪ Neutral Mine'}
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Configuration
              </Typography>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="body2" color="text.secondary">
                    Network
                  </Typography>
                  <Typography variant="body1" sx={{ textTransform: 'capitalize' }}>
                    {settings.network_type}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="body2" color="text.secondary">
                    CPU Threads
                  </Typography>
                  <Typography variant="body1">{settings.cpu_thread_count}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="body2" color="text.secondary">
                    Gas Limit
                  </Typography>
                  <Typography variant="body1">{settings.gas_limit?.toLocaleString() || '200000'}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="body2" color="text.secondary">
                    Max Gas Price
                  </Typography>
                  <Typography variant="body1">{settings.gas_price_gwei} gwei</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="body2" color="text.secondary">
                    Priority Fee
                  </Typography>
                  <Typography variant="body1">{settings.priority_gas_fee_gwei} gwei</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}


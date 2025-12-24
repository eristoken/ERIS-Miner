import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Paper,
  CircularProgress,
  Snackbar,
  Alert,
  Dialog,
  DialogContent,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { Miner } from '../lib/miner';
import { RpcManager } from '../lib/rpcManager';
import { Settings, MiningStats, Chain, RewardTier } from '../types';
import { addLog } from './Console';
import Enigma23Jackpot from '../components/Enigma23Jackpot';
// @ts-ignore - Image import
import erisBanner from '../../eris_app_banner.png';

// Shared miner and RPC manager instances so mining state persists
// across route/tab changes.
let sharedMiner: Miner | null = null;
let sharedRpcManager: RpcManager | null = null;

export default function Home() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [chains, setChains] = useState<Record<string, Chain>>({});
  const [stats, setStats] = useState<MiningStats>({
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
  });
  const [miner, setMiner] = useState<Miner | null>(sharedMiner);
  const [loading, setLoading] = useState(true);
  
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
  
  // Track previous stats to detect changes for toasts
  const [prevStats, setPrevStats] = useState<MiningStats>(stats);

  useEffect(() => {
    loadSettings();
  }, []);

  // Handle toast notifications for stats changes
  useEffect(() => {
    // Submitting toast
    if (stats.isSubmitting && !prevStats.isSubmitting) {
      setToast({
        open: true,
        message: '⏳ Submitting solution to blockchain...',
        severity: 'info',
      });
    }
    
    // Error toast
    if (stats.errorMessage && stats.errorMessage !== prevStats.errorMessage) {
      setToast({
        open: true,
        message: `⚠️ ${stats.errorMessage}`,
        severity: 'error',
      });
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
    sharedMiner.setOnStatsUpdate((updatedStats) => {
      setStats(updatedStats);
    });

    // Set up tier update callback
    sharedMiner.setOnTierUpdate((tier, reward) => {
      if (tier === 'Enigma23') {
        // Show special jackpot animation
        setJackpotReward(reward);
        setShowJackpot(true);
      } else {
        // Show regular tier notification
        setTierNotification({
          open: true,
          tier,
          reward,
        });
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
        {/* Toast Notifications */}
        <Snackbar
          open={toast.open}
          autoHideDuration={stats.errorMessage ? 6000 : 3000}
          onClose={() => setToast({ ...toast, open: false })}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setToast({ ...toast, open: false })}
            severity={toast.severity}
            sx={{ width: '100%' }}
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
            {tierNotification.tier === 'ErisFavor' ? 'Eris Favor' :
             tierNotification.tier === 'DiscordianBlessing' ? 'Discordian Blessing' :
             tierNotification.tier === 'DiscordantMine' ? 'Discordant Mine' :
             tierNotification.tier === 'NeutralMine' ? 'Neutral Mine' :
             'Tier'} Tier Awarded! Reward: {tierNotification.reward} tokens
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
            }
          }}
        >
          <DialogContent sx={{ p: 0 }}>
            <Enigma23Jackpot 
              reward={jackpotReward}
              onClose={() => setShowJackpot(false)}
            />
          </DialogContent>
        </Dialog>
        
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


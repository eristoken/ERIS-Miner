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
  Alert,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { Miner } from '../lib/miner';
import { RpcManager } from '../lib/rpcManager';
import { Settings, MiningStats, Chain } from '../types';
import { addLog } from './Console';

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
    currentChallenge: '0x',
    currentDifficulty: '0',
    currentReward: '0',
    isMining: false,
    solutionFound: false,
    isSubmitting: false,
  });
  const [miner, setMiner] = useState<Miner | null>(sharedMiner);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

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
      miner.stop();
      setStats((prev: MiningStats) => ({ ...prev, isMining: false }));
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
          <Card>
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
              {stats.solutionFound && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  ✓ Solution Found! Processing...
                </Alert>
              )}
              {stats.isSubmitting && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  ⏳ Submitting solution to blockchain...
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Mining Statistics
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Hash Rate
                </Typography>
                <Typography variant="h4">
                  {(stats.hashesPerSecond / 1000).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{' '}
                  kH/s
                </Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Total Hashes
                </Typography>
                <Typography variant="h5">
                  {stats.totalHashes.toLocaleString()}
                </Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Solutions Found
                </Typography>
                <Typography variant="h5">{stats.solutionsFound}</Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Tokens Minted
                </Typography>
                <Typography variant="h5">
                  {stats.tokensMinted.toFixed(6)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
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
                    Mining Style
                  </Typography>
                  <Typography variant="body1" sx={{ textTransform: 'capitalize' }}>
                    {settings.mining_style}
                  </Typography>
                </Grid>
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


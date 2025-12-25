import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { ethers } from 'ethers';
import { Settings, Chain } from '../types';
import { RpcManager } from '../lib/rpcManager';
import ERC918_ABI from '../../abi.json';

interface MinerStats {
  tier1Count: number; // DiscordantMine
  tier2Count: number; // NeutralMine
  tier3Count: number; // ErisFavor
  tier4Count: number; // DiscordianBlessing
  tier5Count: number; // Enigma23
  score: number;
}

interface LeaderboardEntry {
  address: string;
  stats: MinerStats;
  rank: number;
}

export default function Stats() {
  const [location] = useLocation();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [chains, setChains] = useState<Record<string, Chain>>({});
  const [userStats, setUserStats] = useState<MinerStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rpcManager] = useState(() => new RpcManager(200, 20000));

  useEffect(() => {
    loadSettings();
  }, []);

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
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const getContractAddress = async (): Promise<string> => {
    if (!settings) throw new Error('Settings not loaded');
    const contracts = await window.electronAPI.readContracts();
    if (!contracts) {
      throw new Error('Failed to load contracts.json');
    }
    return contracts[settings.network_type].address;
  };

  const fetchStats = useCallback(async () => {
    if (!settings) return;

    setRefreshing(true);
    setError(null);

    try {
      const chainRpcs = await window.electronAPI.readRpcs();
      if (!chainRpcs || !chainRpcs[settings.selected_chain_id]) {
        throw new Error(`No RPCs configured for chain ${settings.selected_chain_id}`);
      }

      // Initialize RPC manager
      await rpcManager.initializeRpcs(
        settings.selected_chain_id,
        chainRpcs[settings.selected_chain_id]
      );

      // Get provider
      const provider = await rpcManager.getProvider(
        settings.selected_chain_id,
        chainRpcs[settings.selected_chain_id]
      );

      const contractAddress = await getContractAddress();
      const contract = new ethers.Contract(
        contractAddress,
        ERC918_ABI,
        provider
      );

      // Fetch user stats
      const userStatsResult = await contract.getMinerStats(settings.mining_account_public_address);
      const userStatsData: MinerStats = {
        tier1Count: Number(userStatsResult.tier1Count),
        tier2Count: Number(userStatsResult.tier2Count),
        tier3Count: Number(userStatsResult.tier3Count),
        tier4Count: Number(userStatsResult.tier4Count),
        tier5Count: Number(userStatsResult.tier5Count),
        score: Number(userStatsResult.score),
      };
      setUserStats(userStatsData);

      // Fetch leaderboard (top 100)
      const leaderboardLimit = 100;
      const [topMiners, statsArray] = await contract.getLeaderboardWithStats(leaderboardLimit);
      
      const leaderboardData: LeaderboardEntry[] = topMiners.map((address: string, index: number) => {
        const stats = statsArray[index];
        return {
          address,
          stats: {
            tier1Count: Number(stats.tier1Count),
            tier2Count: Number(stats.tier2Count),
            tier3Count: Number(stats.tier3Count),
            tier4Count: Number(stats.tier4Count),
            tier5Count: Number(stats.tier5Count),
            score: Number(stats.score),
          },
          rank: index + 1,
        };
      });

      setLeaderboard(leaderboardData);
    } catch (error: any) {
      console.error('Failed to fetch stats:', error);
      setError(`Failed to fetch stats: ${error.message}`);
    } finally {
      setRefreshing(false);
    }
  }, [settings, rpcManager]);

  useEffect(() => {
    // Fetch stats when settings are loaded or when navigating to this page
    if (settings && location === '/stats') {
      fetchStats();
    }
  }, [settings, location, fetchStats]);

  const handleRefresh = async () => {
    await fetchStats();
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

  const chainName = chains[settings.selected_chain_id]?.name || `Chain ${settings.selected_chain_id}`;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Stats</Typography>
        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* User Stats Card */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Your Stats ({chainName})
              </Typography>
              {userStats ? (
                <Grid container spacing={3} sx={{ mt: 1 }}>
                  <Grid item xs={12} sm={6} md={4}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Total Score
                      </Typography>
                      <Typography variant="h4">
                        {userStats.score.toLocaleString()}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        🎰 Enigma23 Jackpots
                      </Typography>
                      <Typography variant="h5" sx={{ color: 'gold', fontWeight: 'bold' }}>
                        {userStats.tier5Count}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        ✨ Discordian Blessing
                      </Typography>
                      <Typography variant="h5" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                        {userStats.tier4Count}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        ⭐ Eris Favor
                      </Typography>
                      <Typography variant="h5" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                        {userStats.tier3Count}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        ⚪ Neutral Mine
                      </Typography>
                      <Typography variant="h5">
                        {userStats.tier2Count}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        ⚡ Discordant Mine
                      </Typography>
                      <Typography variant="h5" sx={{ color: 'warning.main', fontWeight: 'bold' }}>
                        {userStats.tier1Count}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12}>
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        Mining Address
                      </Typography>
                      <Typography variant="body1" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {settings.mining_account_public_address}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              ) : (
                <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                  {refreshing ? (
                    <CircularProgress />
                  ) : (
                    <Typography color="text.secondary">No stats found. Start mining to track your stats!</Typography>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Leaderboard Card */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Rankings ({chainName})
              </Typography>
              {leaderboard.length > 0 ? (
                <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Rank</strong></TableCell>
                        <TableCell><strong>Address</strong></TableCell>
                        <TableCell align="right"><strong>Score</strong></TableCell>
                        <TableCell align="right"><strong>🎰 Enigma23</strong></TableCell>
                        <TableCell align="right"><strong>✨ Blessing</strong></TableCell>
                        <TableCell align="right"><strong>⭐ Favor</strong></TableCell>
                        <TableCell align="right"><strong>⚪ Neutral</strong></TableCell>
                        <TableCell align="right"><strong>⚡ Discordant</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {leaderboard.map((entry) => {
                        const isUser = entry.address.toLowerCase() === settings.mining_account_public_address.toLowerCase();
                        return (
                          <TableRow
                            key={entry.address}
                            sx={{
                              backgroundColor: isUser ? 'action.selected' : 'transparent',
                              '&:hover': { backgroundColor: 'action.hover' },
                            }}
                          >
                            <TableCell>
                              <Typography variant="body2" fontWeight={isUser ? 'bold' : 'normal'}>
                                {entry.rank}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontFamily: 'monospace',
                                  fontWeight: isUser ? 'bold' : 'normal',
                                  color: isUser ? 'primary.main' : 'text.primary',
                                }}
                              >
                                {entry.address.substring(0, 6)}...{entry.address.substring(38)}
                                {isUser && ' (You)'}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" fontWeight={isUser ? 'bold' : 'normal'}>
                                {entry.stats.score.toLocaleString()}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" sx={{ color: entry.stats.tier5Count > 0 ? 'gold' : 'text.secondary' }}>
                                {entry.stats.tier5Count}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" sx={{ color: entry.stats.tier4Count > 0 ? 'success.main' : 'text.secondary' }}>
                                {entry.stats.tier4Count}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" sx={{ color: entry.stats.tier3Count > 0 ? 'primary.main' : 'text.secondary' }}>
                                {entry.stats.tier3Count}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2">
                                {entry.stats.tier2Count}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" sx={{ color: entry.stats.tier1Count > 0 ? 'warning.main' : 'text.secondary' }}>
                                {entry.stats.tier1Count}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                  {refreshing ? (
                    <CircularProgress />
                  ) : (
                    <Typography color="text.secondary">No rankings available yet.</Typography>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}


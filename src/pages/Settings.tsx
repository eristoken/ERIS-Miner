import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  MenuItem,
  Grid,
  Alert,
  FormControl,
  InputLabel,
  Select,
  InputAdornment,
  IconButton,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { Settings as SettingsType, Chain, Contracts } from '../types';
import { addLog } from './Console';

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [chains, setChains] = useState<Record<string, Chain>>({});
  const [contracts, setContracts] = useState<Contracts | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  
  // Get available CPU threads
  const availableThreads = navigator.hardwareConcurrency || 1;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [loadedSettings, loadedChains, loadedContracts] = await Promise.all([
        window.electronAPI.readSettings(),
        window.electronAPI.readChains(),
        window.electronAPI.readContracts(),
      ]);

      if (loadedSettings) {
        setSettings(loadedSettings);
        addLog({
          timestamp: new Date(),
          level: 'info',
          message: 'Settings loaded from settings.json',
        });
      }
      if (loadedChains) {
        setChains(loadedChains);
        addLog({
          timestamp: new Date(),
          level: 'info',
          message: 'Chains loaded from chains.json',
        });
      }
      if (loadedContracts) {
        setContracts(loadedContracts);
        addLog({
          timestamp: new Date(),
          level: 'info',
          message: 'Contracts loaded from contracts.json',
        });
      }
    } catch (err: any) {
      const msg = `Failed to load data: ${err.message}`;
      setError(msg);
      addLog({
        timestamp: new Date(),
        level: 'error',
        message: msg,
      });
    }
  };

  const handleChange = (field: keyof SettingsType, value: any) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      const success = await window.electronAPI.writeSettings(settings);
      if (success) {
        setSaved(true);
        setError(null);
         addLog({
          timestamp: new Date(),
          level: 'success',
          message: 'Settings saved to settings.json',
        });
        setTimeout(() => setSaved(false), 3000);
      } else {
        const msg = 'Failed to save settings';
        setError(msg);
        addLog({
          timestamp: new Date(),
          level: 'error',
          message: msg,
        });
      }
    } catch (err: any) {
      const msg = `Failed to save: ${err.message}`;
      setError(msg);
      addLog({
        timestamp: new Date(),
        level: 'error',
        message: msg,
      });
    }
  };

  if (!settings) {
    return (
      <Box>
        <Typography>Loading settings...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Mining Settings
          </Typography>

          {saved && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Settings saved successfully!
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Mining Account (Public Address)"
                value={settings.mining_account_public_address}
                onChange={(e) => handleChange('mining_account_public_address', e.target.value)}
                margin="normal"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Mining Account (Private Key)"
                type={showPrivateKey ? 'text' : 'password'}
                value={settings.mining_account_private_key}
                onChange={(e) => handleChange('mining_account_private_key', e.target.value)}
                margin="normal"
                helperText="Keep this secure!"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle private key visibility"
                        onClick={() => setShowPrivateKey(!showPrivateKey)}
                        edge="end"
                      >
                        {showPrivateKey ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth margin="normal">
                <InputLabel>Network</InputLabel>
                <Select
                  value={settings.network_type}
                  label="Network"
                  onChange={(e) => handleChange('network_type', e.target.value)}
                >
                  <MenuItem value="mainnet">Mainnet</MenuItem>
                  <MenuItem value="testnet">Testnet</MenuItem>
                </Select>
              </FormControl>
              {contracts && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.75 }}>
                  {contracts[settings.network_type].name}: {contracts[settings.network_type].address}
                </Typography>
              )}
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth margin="normal">
                <InputLabel>Chain</InputLabel>
                <Select
                  value={settings.selected_chain_id}
                  label="Chain"
                  onChange={(e) => handleChange('selected_chain_id', e.target.value)}
                >
                  {Object.entries(chains).map(([chainId, chain]) => (
                    <MenuItem key={chainId} value={chainId}>
                      {chain.name} (Chain ID: {chainId})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Max Gas Price (Gwei)"
                type="number"
                value={settings.gas_price_gwei}
                onChange={(e) => handleChange('gas_price_gwei', parseFloat(e.target.value) || 0)}
                margin="normal"
                inputProps={{ min: 0, step: 0.1 }}
                helperText="Maximum fee per gas (calculated dynamically if lower)"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Priority Gas Fee (Gwei)"
                type="number"
                value={settings.priority_gas_fee_gwei}
                onChange={(e) => handleChange('priority_gas_fee_gwei', parseFloat(e.target.value) || 0)}
                margin="normal"
                inputProps={{ min: 0, step: 0.1 }}
                helperText="Miner tip (can be less than 1, e.g., 0.1)"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Gas Limit"
                type="number"
                value={settings.gas_limit}
                onChange={(e) => handleChange('gas_limit', parseInt(e.target.value) || 200000)}
                margin="normal"
                inputProps={{ min: 100000, max: 500000, step: 10000 }}
                helperText="Gas limit for mint transactions (default: 200000)"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="CPU Thread Count"
                type="number"
                value={settings.cpu_thread_count}
                onChange={(e) => handleChange('cpu_thread_count', parseInt(e.target.value) || 1)}
                margin="normal"
                inputProps={{ min: 1, max: availableThreads }}
                helperText={`Available threads: ${availableThreads} (recommended: ${availableThreads * .8})`}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="RPC Rate Limit (ms)"
                type="number"
                value={settings.rpc_rate_limit_ms}
                onChange={(e) => handleChange('rpc_rate_limit_ms', parseInt(e.target.value) || 0)}
                margin="normal"
                inputProps={{ min: 0 }}
                helperText="0 to disable rate limiting"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="RPC Switch Delay (seconds)"
                type="number"
                value={settings.rpc_switch_delay_seconds}
                onChange={(e) => handleChange('rpc_switch_delay_seconds', parseInt(e.target.value) || 20)}
                margin="normal"
                inputProps={{ min: 0 }}
                helperText="Delay before switching to next RPC when rate limited"
              />
            </Grid>

            <Grid item xs={12}>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSave}
                size="large"
              >
                Save Settings
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}


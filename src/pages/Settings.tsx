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
  FormControlLabel,
  Switch,
  Divider,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { Settings as SettingsType, Chain, Contracts } from '../types';
import { addLog } from './consoleUtils';

interface GPUInfo {
  available: boolean;
  maxWorkgroupSize: number;
  maxInvocationsPerWorkgroup: number;
  adapterInfo?: string;
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [chains, setChains] = useState<Record<string, Chain>>({});
  const [contracts, setContracts] = useState<Contracts | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [gpuInfo, setGpuInfo] = useState<GPUInfo | null>(null);
  
  // Get available CPU threads
  const availableThreads = navigator.hardwareConcurrency || 1;
  const recommendedThreads = Math.floor(availableThreads * 0.8);

  useEffect(() => {
    loadData();
    detectGPU();
  }, []);

  const detectGPU = async () => {
    try {
      if (!navigator.gpu) {
        setGpuInfo({
          available: false,
          maxWorkgroupSize: 0,
          maxInvocationsPerWorkgroup: 0,
        });
        return;
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        setGpuInfo({
          available: false,
          maxWorkgroupSize: 0,
          maxInvocationsPerWorkgroup: 0,
        });
        return;
      }

      // Get adapter limits
      const limits = adapter.limits;
      const maxWorkgroupSize = limits.maxComputeWorkgroupSizeX || 256;
      const maxInvocations = limits.maxComputeInvocationsPerWorkgroup || 256;

      // Try to get adapter info (may not be available in all browsers)
      let adapterInfo = 'Unknown GPU';
      if (adapter.info) {
        adapterInfo = `${adapter.info.vendor || 'Unknown'} ${adapter.info.architecture || ''}`.trim() || 'Unknown GPU';
      }

      setGpuInfo({
        available: true,
        maxWorkgroupSize,
        maxInvocationsPerWorkgroup: maxInvocations,
        adapterInfo,
      });
    } catch (err: any) {
      console.error('Failed to detect GPU:', err);
      setGpuInfo({
        available: false,
        maxWorkgroupSize: 0,
        maxInvocationsPerWorkgroup: 0,
      });
    }
  };

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h5">
              Mining Settings
            </Typography>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              size="medium"
            >
              Save Settings
            </Button>
          </Box>

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
                  {contracts && Object.entries(contracts).map(([networkKey, contract]) => (
                    <MenuItem key={networkKey} value={networkKey}>
                      {contract.name} ({networkKey})
                    </MenuItem>
                  ))}
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
                helperText={`Available threads: ${availableThreads} (recommended: ${recommendedThreads})`}
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" sx={{ mb: 2 }}>
                GPU Mining (WebGPU)
              </Typography>
            </Grid>

            <Grid item xs={12}>
              {gpuInfo && (
                <Box sx={{ mb: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                  {gpuInfo.available ? (
                    <>
                      <Typography variant="body2" color="success.main" sx={{ mb: 1 }}>
                        ✓ WebGPU Available
                      </Typography>
                      {gpuInfo.adapterInfo && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                          GPU: {gpuInfo.adapterInfo}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Max Workgroup Size: {gpuInfo.maxWorkgroupSize} threads
                        {gpuInfo.maxInvocationsPerWorkgroup !== gpuInfo.maxWorkgroupSize && 
                          ` (Max Invocations: ${gpuInfo.maxInvocationsPerWorkgroup})`}
                      </Typography>
                    </>
                  ) : (
                    <Typography variant="body2" color="error.main">
                      ✗ WebGPU Not Available
                    </Typography>
                  )}
                </Box>
              )}
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.gpu_mining_enabled || false}
                    onChange={(e) => handleChange('gpu_mining_enabled', e.target.checked)}
                    disabled={!gpuInfo?.available}
                  />
                }
                label="Enable GPU Mining"
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, ml: 4.5 }}>
                Use WebGPU to accelerate mining on supported GPUs. Requires a browser/Electron with WebGPU support.
                {!gpuInfo?.available && ' WebGPU is not available on this system.'}
              </Typography>
            </Grid>

            {settings.gpu_mining_enabled && (
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="GPU Workgroup Size"
                  type="number"
                  value={settings.gpu_workgroup_size || 256}
                  onChange={(e) => handleChange('gpu_workgroup_size', parseInt(e.target.value) || 256)}
                  margin="normal"
                  inputProps={{ 
                    min: 64, 
                    max: gpuInfo?.maxWorkgroupSize || 1024, 
                    step: 64 
                  }}
                  helperText={
                    gpuInfo?.available
                      ? `Number of parallel threads per GPU workgroup (64-${gpuInfo.maxWorkgroupSize}, recommended: ${Math.min(256, gpuInfo.maxWorkgroupSize)})`
                      : 'Number of parallel threads per GPU workgroup (64-1024, recommended: 256)'
                  }
                />
              </Grid>
            )}

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" sx={{ mb: 2 }}>
                RPC Rate Limits
              </Typography>
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
                helperText="Minimum interval between general RPC calls (0 to disable)"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Submission Rate Limit (ms)"
                type="number"
                value={settings.submission_rate_limit_ms}
                onChange={(e) => handleChange('submission_rate_limit_ms', parseInt(e.target.value) || 0)}
                margin="normal"
                inputProps={{ min: 0 }}
                helperText="Delay between solution submissions (0 to disable)"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Challenge Poll Interval (ms)"
                type="number"
                value={settings.challenge_poll_interval_ms}
                onChange={(e) => handleChange('challenge_poll_interval_ms', parseInt(e.target.value) || 0)}
                margin="normal"
                inputProps={{ min: 0 }}
                helperText="Minimum interval between challenge polling calls"
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

          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}


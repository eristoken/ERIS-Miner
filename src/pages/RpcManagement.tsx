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
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Paper,
  Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import { Chain, RpcEndpoint } from '../types';
import { addLog } from './Console';

export default function RpcManagement() {
  const [chains, setChains] = useState<Record<string, Chain>>({});
  const [rpcs, setRpcs] = useState<Record<string, RpcEndpoint[]>>({});
  const [selectedChainId, setSelectedChainId] = useState<string>('');
  const [newRpcUrl, setNewRpcUrl] = useState('');
  const [newRpcName, setNewRpcName] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [loadedChains, loadedRpcs] = await Promise.all([
        window.electronAPI.readChains(),
        window.electronAPI.readRpcs(),
      ]);

      if (loadedChains) {
        setChains(loadedChains);
        const firstChainId = Object.keys(loadedChains)[0];
        if (firstChainId) {
          setSelectedChainId(firstChainId);
        }
        addLog({
          timestamp: new Date(),
          level: 'info',
          message: 'Chains loaded from chains.json',
        });
      }
      if (loadedRpcs) {
        setRpcs(loadedRpcs);
        addLog({
          timestamp: new Date(),
          level: 'info',
          message: 'RPCs loaded from rpcs.json',
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

  const handleAddRpc = () => {
    if (!selectedChainId || !newRpcUrl || !newRpcName) {
      setError('Please fill in all fields');
      return;
    }

    const chainRpcs = rpcs[selectedChainId] || [];
    if (chainRpcs.some((rpc) => rpc.url === newRpcUrl)) {
      setError('RPC URL already exists for this chain');
      return;
    }

    const updatedRpcs = {
      ...rpcs,
      [selectedChainId]: [...chainRpcs, { url: newRpcUrl, name: newRpcName }],
    };

    setRpcs(updatedRpcs);
    setNewRpcUrl('');
    setNewRpcName('');
    setError(null);

    addLog({
      timestamp: new Date(),
      level: 'info',
      message: `Added RPC for chain ${selectedChainId}: ${newRpcName} (${newRpcUrl})`,
    });
  };

  const handleRemoveRpc = (chainId: string, index: number) => {
    const chainRpcs = rpcs[chainId] || [];
    if (chainRpcs.length <= 1) {
      setError('Cannot remove the last RPC for a chain');
      return;
    }

    const updatedRpcs = {
      ...rpcs,
      [chainId]: chainRpcs.filter((_, i) => i !== index),
    };

    setRpcs(updatedRpcs);
    setError(null);

    addLog({
      timestamp: new Date(),
      level: 'warn',
      message: `Removed RPC index ${index} from chain ${chainId}`,
    });
  };

  const handleSave = async () => {
    try {
      const success = await window.electronAPI.writeRpcs(rpcs);
      if (success) {
        setSaved(true);
        setError(null);
        addLog({
          timestamp: new Date(),
          level: 'success',
          message: 'RPCs saved to rpcs.json',
        });
        setTimeout(() => setSaved(false), 3000);
      } else {
        const msg = 'Failed to save RPCs';
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

  const currentChainRpcs = selectedChainId ? rpcs[selectedChainId] || [] : [];

  return (
    <Box>
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h5">
              RPC Endpoint Management
            </Typography>
            <Button
              variant="contained"
              color="primary"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              size="medium"
            >
              Save All RPCs
            </Button>
          </Box>

          {saved && (
            <Alert severity="success" sx={{ mb: 2 }}>
              RPCs saved successfully!
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth margin="normal">
                <InputLabel>Select Chain</InputLabel>
                <Select
                  value={selectedChainId}
                  label="Select Chain"
                  onChange={(e) => setSelectedChainId(e.target.value)}
                >
                  {Object.entries(chains).map(([chainId, chain]) => (
                    <MenuItem key={chainId} value={chainId}>
                      {chain.name} (Chain ID: {chainId})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom>
                Add New RPC
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="RPC Name"
                value={newRpcName}
                onChange={(e) => setNewRpcName(e.target.value)}
                margin="normal"
                placeholder="e.g., Alchemy, Infura, Public RPC"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="RPC URL"
                value={newRpcUrl}
                onChange={(e) => setNewRpcUrl(e.target.value)}
                margin="normal"
                placeholder="https://..."
              />
            </Grid>

            <Grid item xs={12}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddRpc}
                disabled={!selectedChainId || !newRpcUrl || !newRpcName}
              >
                Add RPC
              </Button>
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom>
                Current RPCs for {chains[selectedChainId]?.name || 'Selected Chain'}
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <Paper>
                <List>
                  {currentChainRpcs.length === 0 ? (
                    <ListItem>
                      <ListItemText primary="No RPCs configured for this chain" />
                    </ListItem>
                  ) : (
                    currentChainRpcs.map((rpc, index) => (
                      <ListItem key={index}>
                        <ListItemText
                          primary={rpc.name}
                          secondary={rpc.url}
                        />
                        <ListItemSecondaryAction>
                          <IconButton
                            edge="end"
                            onClick={() => handleRemoveRpc(selectedChainId, index)}
                            disabled={currentChainRpcs.length <= 1}
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))
                  )}
                </List>
              </Paper>
            </Grid>

          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}


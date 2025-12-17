import React, { useState, useEffect } from 'react';
import './SettingsPanel.css';

function SettingsPanel() {
  const [settings, setSettings] = useState<any>(null);
  const [chains, setChains] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }
    const [loadedSettings, loadedChains] = await Promise.all([
      window.electronAPI.loadSettings(),
      window.electronAPI.loadChains(),
    ]);
    setSettings(loadedSettings);
    setChains(loadedChains);
  };

  const handleChange = (field: string, value: any) => {
    setSettings((prev: any) => ({
      ...prev,
      [field]: value,
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }
    setSaving(true);
    const success = await window.electronAPI.saveSettings(settings);
    if (success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  const convertGweiToWei = (gwei: number): number => {
    // Convert Gwei to Wei (1 Gwei = 1e9 Wei)
    // Support values below 1, e.g., 0.00000005 Gwei = 50 Wei
    return Math.floor(gwei * 1e9);
  };

  const convertWeiToGwei = (wei: string | number): number => {
    const w = typeof wei === 'string' ? parseFloat(wei) : wei;
    // Convert Wei to Gwei
    return w / 1e9;
  };

  if (!settings) {
    return <div className="settings-loading">Loading settings...</div>;
  }

  const chainOptions = Object.entries(chains).map(([chainId, chain]: [string, any]) => (
    <option key={chainId} value={chainId}>
      {chain.name} (Chain ID: {chain.chainId})
    </option>
  ));

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>Mining Settings</h2>
        <button
          className={`btn-save ${saved ? 'saved' : ''}`}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      <div className="settings-form">
        <div className="form-section">
          <h3>Account Settings</h3>
          
          <div className="form-group">
            <label>Public Address</label>
            <input
              type="text"
              value={settings.mining_account_public_address || ''}
              onChange={(e) => handleChange('mining_account_public_address', e.target.value)}
              placeholder="0x..."
            />
          </div>

          <div className="form-group">
            <label>Private Key</label>
            <input
              type="password"
              value={settings.mining_account_private_key || ''}
              onChange={(e) => handleChange('mining_account_private_key', e.target.value)}
              placeholder="0x..."
            />
          </div>
        </div>

        <div className="form-section">
          <h3>Chain & Contract</h3>
          
          <div className="form-group">
            <label>Chain</label>
            <select
              value={settings.selected_chain || '84532'}
              onChange={(e) => handleChange('selected_chain', e.target.value)}
            >
              {chainOptions}
            </select>
          </div>

          <div className="form-group">
            <label>Contract Address</label>
            <input
              type="text"
              value={settings.contract_address || ''}
              onChange={(e) => handleChange('contract_address', e.target.value)}
              placeholder="0x..."
            />
          </div>

          <div className="form-group">
            <label>Mining Style</label>
            <select
              value={settings.mining_style || 'solo'}
              onChange={(e) => handleChange('mining_style', e.target.value)}
            >
              <option value="solo">Solo</option>
              <option value="pool">Pool</option>
            </select>
          </div>

          {settings.mining_style === 'pool' && (
            <div className="form-group">
              <label>Pool URL</label>
              <input
                type="text"
                value={settings.pool_url || ''}
                onChange={(e) => handleChange('pool_url', e.target.value)}
                placeholder="http://tokenminingpool.com:8080"
              />
            </div>
          )}
        </div>

        <div className="form-section">
          <h3>Gas Settings</h3>
          
          <div className="form-group">
            <label>Gas Price (Gwei)</label>
            <input
              type="number"
              step="0.00000001"
              min="0"
              value={settings.gas_price_gwei ? convertWeiToGwei(settings.gas_price_gwei) : 1}
              onChange={(e) => {
                const gwei = parseFloat(e.target.value) || 0;
                handleChange('gas_price_gwei', convertGweiToWei(gwei));
              }}
              placeholder="1"
            />
            <small>Values below 1 are supported (e.g., 0.00000005). Stored as Wei internally.</small>
          </div>

          <div className="form-group">
            <label>Priority Fee (Gwei)</label>
            <input
              type="number"
              step="0.00000001"
              min="0"
              value={settings.priority_gas_fee_gwei ? convertWeiToGwei(settings.priority_gas_fee_gwei) : 1}
              onChange={(e) => {
                const gwei = parseFloat(e.target.value) || 0;
                handleChange('priority_gas_fee_gwei', convertGweiToWei(gwei));
              }}
              placeholder="1"
            />
            <small>Values below 1 are supported (e.g., 0.00000005). Stored as Wei internally.</small>
          </div>
        </div>

        <div className="form-section">
          <h3>Performance Settings</h3>
          
          <div className="form-group">
            <label>CPU Thread Count</label>
            <input
              type="number"
              min="1"
              max={navigator.hardwareConcurrency || 8}
              value={settings.cpu_thread_count || 1}
              onChange={(e) => handleChange('cpu_thread_count', parseInt(e.target.value) || 1)}
            />
            <small>Available CPU cores: {navigator.hardwareConcurrency || 'Unknown'}</small>
          </div>

          <div className="form-group">
            <label>Rate Limiter (ms)</label>
            <input
              type="number"
              min="0"
              value={settings.rate_limiter_ms || 200}
              onChange={(e) => handleChange('rate_limiter_ms', parseInt(e.target.value) || 0)}
            />
            <small>Delay between RPC calls. Set to 0 to disable.</small>
          </div>

          <div className="form-group">
            <label>Auto-Failover Cooldown (seconds)</label>
            <input
              type="number"
              min="0"
              value={settings.auto_failover_cooldown_seconds || 20}
              onChange={(e) => handleChange('auto_failover_cooldown_seconds', parseInt(e.target.value) || 20)}
            />
            <small>Time to wait before switching to next RPC on failure.</small>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;


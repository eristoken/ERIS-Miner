import React, { useState, useEffect } from 'react';
import './RpcManager.css';

function RpcManager() {
  const [rpcs, setRpcs] = useState<any>({});
  const [chains, setChains] = useState<any>({});
  const [selectedChain, setSelectedChain] = useState<string>('');
  const [newRpc, setNewRpc] = useState<string>('');
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
    const [loadedRpcs, loadedChains] = await Promise.all([
      window.electronAPI.loadRpcs(),
      window.electronAPI.loadChains(),
    ]);
    setRpcs(loadedRpcs);
    setChains(loadedChains);
    if (Object.keys(loadedChains).length > 0 && !selectedChain) {
      setSelectedChain(Object.keys(loadedChains)[0]);
    }
  };

  const handleAddRpc = () => {
    if (!newRpc.trim() || !selectedChain) return;

    const rpcUrl = newRpc.trim();
    if (!rpcUrl.startsWith('http://') && !rpcUrl.startsWith('https://')) {
      alert('RPC URL must start with http:// or https://');
      return;
    }

    setRpcs((prev: any) => {
      const chainRpcs = prev[selectedChain] || [];
      if (chainRpcs.includes(rpcUrl)) {
        alert('This RPC is already in the list');
        return prev;
      }
      return {
        ...prev,
        [selectedChain]: [...chainRpcs, rpcUrl],
      };
    });

    setNewRpc('');
    setSaved(false);
  };

  const handleRemoveRpc = (chainId: string, rpcUrl: string) => {
    setRpcs((prev: any) => {
      const chainRpcs = prev[chainId] || [];
      return {
        ...prev,
        [chainId]: chainRpcs.filter((url: string) => url !== rpcUrl),
      };
    });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }
    setSaving(true);
    const success = await window.electronAPI.saveRpcs(rpcs);
    if (success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  const chainOptions = Object.entries(chains).map(([chainId, chain]: [string, any]) => (
    <option key={chainId} value={chainId}>
      {chain.name} (Chain ID: {chain.chainId})
    </option>
  ));

  const currentRpcs = selectedChain ? (rpcs[selectedChain] || []) : [];

  return (
    <div className="rpc-manager">
      <div className="rpc-header">
        <h2>RPC Manager</h2>
        <button
          className={`btn-save ${saved ? 'saved' : ''}`}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save RPCs'}
        </button>
      </div>

      <div className="rpc-content">
        <div className="rpc-selector">
          <label>Select Chain</label>
          <select
            value={selectedChain}
            onChange={(e) => setSelectedChain(e.target.value)}
          >
            {chainOptions}
          </select>
        </div>

        {selectedChain && (
          <>
            <div className="rpc-add">
              <h3>Add RPC for {chains[selectedChain]?.name}</h3>
              <div className="rpc-add-form">
                <input
                  type="text"
                  value={newRpc}
                  onChange={(e) => setNewRpc(e.target.value)}
                  placeholder="https://rpc.example.com"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleAddRpc();
                    }
                  }}
                />
                <button onClick={handleAddRpc}>Add RPC</button>
              </div>
            </div>

            <div className="rpc-list">
              <h3>RPCs for {chains[selectedChain]?.name}</h3>
              {currentRpcs.length === 0 ? (
                <div className="no-rpcs">No RPCs configured for this chain.</div>
              ) : (
                <div className="rpc-items">
                  {currentRpcs.map((rpc: string, index: number) => (
                    <div key={index} className="rpc-item">
                      <div className="rpc-url">{rpc}</div>
                      <button
                        className="btn-remove"
                        onClick={() => handleRemoveRpc(selectedChain, rpc)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default RpcManager;


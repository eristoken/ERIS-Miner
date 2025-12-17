import React, { useState, useEffect } from 'react';
import './MiningDashboard.css';

interface MiningStats {
  hashesPerSecond: number;
  totalHashes: number;
  solutionsFound: number;
  successfulMints: number;
  failedMints: number;
  currentChallenge: string;
  currentTarget: string;
  currentDifficulty: string;
  lastSolutionTime: number | null;
  lastMintTime: number | null;
  isMining: boolean;
  currentRpc: string;
  rpcFailures: number;
  epoch: number;
  activeWorkers?: number;
  logs?: Array<{ timestamp: number; level: string; message: string }>;
}

interface Props {
  stats: MiningStats | null;
  isMining: boolean;
  onStatusChange?: () => void;
}

function MiningDashboard({ stats, isMining, onStatusChange }: Props) {
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.loadSettings().then(setSettings).catch(console.error);
    }
  }, []);

  const handleStart = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }
    if (!settings) {
      const loadedSettings = await window.electronAPI.loadSettings();
      setSettings(loadedSettings);
      await window.electronAPI.startMining(loadedSettings);
    } else {
      await window.electronAPI.startMining(settings);
    }
  };

  const handleStop = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }
    await window.electronAPI.stopMining();
    // Force refresh status after stopping
    if (onStatusChange) {
      onStatusChange();
    }
  };

  const formatNumber = (num: number | bigint | string) => {
    if (num === null || num === undefined) return '0';
    const n = typeof num === 'string' ? parseFloat(num) : Number(num);
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toLocaleString();
  };

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="mining-dashboard">
      <div className="dashboard-header">
        <h2>Mining Dashboard</h2>
        <div className="mining-controls">
          {!isMining ? (
            <button className="btn-start" onClick={handleStart}>
              Start Mining
            </button>
          ) : (
            <button className="btn-stop" onClick={handleStop}>
              Stop Mining
            </button>
          )}
          <div className={`status-indicator ${isMining ? 'active' : 'inactive'}`}>
            <span className="status-dot"></span>
            {isMining ? 'Mining' : 'Stopped'}
          </div>
        </div>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Hash Rate</div>
            <div className="stat-value">{formatNumber(stats.hashesPerSecond)} H/s</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Total Hashes</div>
            <div className="stat-value">{formatNumber(stats.totalHashes)}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Solutions Found</div>
            <div className="stat-value">{formatNumber(stats.solutionsFound)}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Successful Mints</div>
            <div className="stat-value success">{formatNumber(stats.successfulMints)}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Failed Mints</div>
            <div className="stat-value error">{formatNumber(stats.failedMints)}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Current Difficulty</div>
            <div className="stat-value">{formatNumber(stats.currentDifficulty)}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Current Target</div>
            <div className="stat-value small">{stats.currentTarget.substring(0, 20)}...</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Current Challenge</div>
            <div className="stat-value small">{stats.currentChallenge.substring(0, 20)}...</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Epoch</div>
            <div className="stat-value">{formatNumber(stats.epoch)}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Last Solution</div>
            <div className="stat-value">{formatTime(stats.lastSolutionTime)}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Last Mint</div>
            <div className="stat-value">{formatTime(stats.lastMintTime)}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Current RPC</div>
            <div className="stat-value small">{stats.currentRpc || 'Not connected'}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">RPC Failures</div>
            <div className="stat-value">{formatNumber(stats.rpcFailures)}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Active Workers</div>
            <div className="stat-value">{stats.activeWorkers || 0}</div>
          </div>
        </div>
      )}

      {!stats && (
        <div className="no-stats">
          <p>No mining statistics available. Start mining to see stats.</p>
        </div>
      )}
    </div>
  );
}

export default MiningDashboard;


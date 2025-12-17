import React, { useState, useEffect } from 'react';
import MiningDashboard from './components/MiningDashboard';
import SettingsPanel from './components/SettingsPanel';
import RpcManager from './components/RpcManager';
import ConsoleView from './components/ConsoleView';
import './App.css';

declare global {
  interface Window {
    electronAPI: {
      loadChains: () => Promise<any>;
      loadRpcs: () => Promise<any>;
      saveRpcs: (rpcs: any) => Promise<boolean>;
      loadSettings: () => Promise<any>;
      saveSettings: (settings: any) => Promise<boolean>;
      startMining: (settings: any) => Promise<any>;
      stopMining: () => Promise<any>;
      getMiningStatus: () => Promise<any>;
      clearLogs: () => Promise<any>;
      onMiningStats: (callback: (stats: any) => void) => void;
      removeMiningStatsListener: () => void;
    };
  }
}

type Tab = 'mining' | 'settings' | 'rpcs' | 'console';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('mining');
  const [miningStats, setMiningStats] = useState<any>(null);
  const [isMining, setIsMining] = useState(false);
  
  // Function to refresh mining status
  const refreshMiningStatus = React.useCallback(async () => {
    if (window.electronAPI) {
      try {
        const status = await window.electronAPI.getMiningStatus();
        setIsMining(status.isMining);
        if (status.stats) {
          setMiningStats(status.stats);
        }
      } catch (error) {
        console.error('Error refreshing mining status:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (!window.electronAPI) {
      console.warn('electronAPI not available');
      return;
    }

    // Load initial mining status
    window.electronAPI.getMiningStatus().then((status) => {
      setIsMining(status.isMining);
      if (status.stats) {
        setMiningStats(status.stats);
      }
    }).catch(console.error);

    // Listen for mining stats updates
    window.electronAPI.onMiningStats((stats) => {
      setMiningStats(stats);
      setIsMining(stats.isMining);
    });

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeMiningStatsListener();
      }
    };
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>ERIS Token Miner</h1>
        <nav className="app-nav">
          <button
            className={activeTab === 'mining' ? 'active' : ''}
            onClick={() => setActiveTab('mining')}
          >
            Mining
          </button>
          <button
            className={activeTab === 'settings' ? 'active' : ''}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
          <button
            className={activeTab === 'rpcs' ? 'active' : ''}
            onClick={() => setActiveTab('rpcs')}
          >
            RPCs
          </button>
          <button
            className={activeTab === 'console' ? 'active' : ''}
            onClick={() => setActiveTab('console')}
          >
            Console
          </button>
        </nav>
      </header>
      <main className="app-main">
        {activeTab === 'mining' && (
          <MiningDashboard 
            stats={miningStats} 
            isMining={isMining} 
            onStatusChange={refreshMiningStatus}
          />
        )}
        {activeTab === 'settings' && <SettingsPanel />}
        {activeTab === 'rpcs' && <RpcManager />}
        {activeTab === 'console' && (
          <div className="console-tab">
            <ConsoleView 
              logs={miningStats?.logs || []} 
              onClear={async () => {
                if (window.electronAPI) {
                  try {
                    await window.electronAPI.clearLogs();
                    // The stats will be updated via the mining-stats event
                    // But also refresh to be sure
                    setTimeout(() => refreshMiningStatus(), 100);
                  } catch (error) {
                    console.error('Error clearing logs:', error);
                  }
                }
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;


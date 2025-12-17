import React, { useEffect, useRef } from 'react';
import './ConsoleView.css';

interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
}

interface Props {
  logs: LogEntry[];
  onClear?: () => void;
}

function ConsoleView({ logs, onClear }: Props) {
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const getLogClass = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'log-error';
      case 'success':
        return 'log-success';
      case 'warning':
        return 'log-warning';
      case 'debug':
        return 'log-debug';
      default:
        return 'log-info';
    }
  };

  return (
    <div className="console-view">
      <div className="console-header">
        <h3>Console Output</h3>
        <div className="console-header-right">
          <span className="console-count">{logs.length} entries</span>
          <button className="btn-clear" onClick={onClear} title="Clear console">
            Clear
          </button>
        </div>
      </div>
      <div className="console-content">
        {logs.length === 0 ? (
          <div className="console-empty">No logs yet. Start mining to see output.</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={`console-line ${getLogClass(log.level)}`}>
              <span className="log-time">[{formatTime(log.timestamp)}]</span>
              <span className="log-level">[{log.level.toUpperCase()}]</span>
              <span className="log-message">{log.message}</span>
            </div>
          ))
        )}
        <div ref={consoleEndRef} />
      </div>
    </div>
  );
}

export default ConsoleView;


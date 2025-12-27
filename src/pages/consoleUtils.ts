// Separate file to avoid react-refresh warning
import { LogEntry } from '../types';

let globalLogs: LogEntry[] = [];
let logListeners: ((logs: LogEntry[]) => void)[] = [];

export function addLog(entry: LogEntry) {
  globalLogs.push(entry);
  // Keep only last 1000 entries
  if (globalLogs.length > 1000) {
    globalLogs = globalLogs.slice(-1000);
  }
  logListeners.forEach((listener) => listener([...globalLogs]));
}

export function subscribeToLogs(callback: (logs: LogEntry[]) => void) {
  logListeners.push(callback);
  callback([...globalLogs]);
  return () => {
    logListeners = logListeners.filter((l) => l !== callback);
  };
}

export function clearLogs() {
  globalLogs = [];
  logListeners.forEach((listener) => listener([]));
}


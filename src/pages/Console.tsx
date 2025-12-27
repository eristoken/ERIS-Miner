import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Paper,
  TextField,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import { LogEntry } from '../types';
import { subscribeToLogs } from './consoleUtils';

export default function Console() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = subscribeToLogs((newLogs) => {
      setLogs(newLogs);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleClear = () => {
    globalLogs = [];
    setLogs([]);
    logListeners.forEach((listener) => listener([]));
  };

  const getLogColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return '#f44336';
      case 'warn':
        return '#ff9800';
      case 'success':
        return '#4caf50';
      default:
        return '#2196f3';
    }
  };

  const filteredLogs = filter
    ? logs.filter((log) =>
        log.message.toLowerCase().includes(filter.toLowerCase())
      )
    : logs;

  return (
    <Box>
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h5">Console</Typography>
            <Box>
              <TextField
                size="small"
                placeholder="Filter logs..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                sx={{ mr: 2, width: 200 }}
              />
              <Button
                variant="outlined"
                startIcon={<ClearIcon />}
                onClick={handleClear}
              >
                Clear
              </Button>
            </Box>
          </Box>

          <Paper
            sx={{
              height: '600px',
              overflow: 'auto',
              p: 2,
              backgroundColor: '#1e1e1e',
              fontFamily: 'monospace',
            }}
          >
            {filteredLogs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No logs to display
              </Typography>
            ) : (
              filteredLogs.map((log, index) => (
                <Box
                  key={index}
                  sx={{
                    mb: 1,
                    color: getLogColor(log.level),
                    fontSize: '0.875rem',
                  }}
                >
                  <Typography
                    component="span"
                    sx={{
                      color: '#888',
                      fontSize: '0.75rem',
                      mr: 1,
                    }}
                  >
                    [{log.timestamp.toLocaleTimeString()}]
                  </Typography>
                  <Typography
                    component="span"
                    sx={{
                      fontWeight: 'bold',
                      mr: 1,
                      textTransform: 'uppercase',
                    }}
                  >
                    [{log.level}]
                  </Typography>
                  <Typography component="span">{log.message}</Typography>
                </Box>
              ))
            )}
            <div ref={logsEndRef} />
          </Paper>
        </CardContent>
      </Card>
    </Box>
  );
}


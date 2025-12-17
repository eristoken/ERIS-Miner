import { useState, useEffect } from 'react';
import { Router, Route, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Tabs,
  Tab,
  Box,
  ThemeProvider,
  createTheme,
  CssBaseline,
} from '@mui/material';
import Home from './pages/Home';
import Settings from './pages/Settings';
import RpcManagement from './pages/RpcManagement';
import Console from './pages/Console';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function NavigationTabs() {
  const [location, setLocation] = useLocation();
  const [value, setValue] = useState(0);

  useEffect(() => {
    const path = location;
    if (path === '/' || path === '') setValue(0);
    else if (path === '/settings') setValue(1);
    else if (path === '/rpcs') setValue(2);
    else if (path === '/console') setValue(3);
  }, [location]);

  const handleChange = (_: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
    const paths = ['/', '/settings', '/rpcs', '/console'];
    setLocation(paths[newValue]);
  };

  return (
    <Tabs
      value={value}
      onChange={handleChange}
      sx={{ borderBottom: 1, borderColor: 'divider' }}
    >
      <Tab label="Home" />
      <Tab label="Settings" />
      <Tab label="RPCs" />
      <Tab label="Console" />
    </Tabs>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router hook={useHashLocation}>
        <Box sx={{ flexGrow: 1 }}>
          <AppBar position="static">
            <Toolbar>
              <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                $ERIS Token Official GUI Miner
              </Typography>
            </Toolbar>
          </AppBar>
          <NavigationTabs />
          <Container maxWidth="lg" sx={{ mt: 3, mb: 3 }}>
            <Route path="/" component={Home} />
            <Route path="/settings" component={Settings} />
            <Route path="/rpcs" component={RpcManagement} />
            <Route path="/console" component={Console} />
          </Container>
        </Box>
      </Router>
    </ThemeProvider>
  );
}

export default App;


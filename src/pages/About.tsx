import {
  Card,
  CardContent,
  Typography,
  Box,
  Grid,
  Divider,
  Button,
} from '@mui/material';

// Vite will inject these at build time from package.json
const APP_VERSION = import.meta.env.APP_VERSION || '0.0.1';
const APP_NAME = import.meta.env.APP_NAME || 'eris-miner';
const APP_DESCRIPTION = import.meta.env.APP_DESCRIPTION || 'ERC-918 Token Miner with Electron, React, TypeScript, and Material-UI';
const APP_LICENSE = import.meta.env.APP_LICENSE || 'MIT';

function About() {

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h4" gutterBottom>
              About ERIS Miner
            </Typography>
            <Divider sx={{ my: 2 }} />
            
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Application Information
              </Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Name:</strong> {APP_NAME}
              </Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Version:</strong> {APP_VERSION}
              </Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Description:</strong> {APP_DESCRIPTION}
              </Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>License:</strong> {APP_LICENSE}
              </Typography>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Technology Stack
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                • Electron 39.2.7
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                • React 18.3.1
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                • TypeScript 5.5.3
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                • Material-UI 5.15.15
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                • Ethers.js 6.13.0
              </Typography>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                About
              </Typography>
              <Typography variant="body2" paragraph>
                ERIS Miner is an ERC-918 token mining application that allows users to mine tokens
                on various EVM-compatible blockchains. The application supports solo mining with
                configurable RPC endpoints, gas settings, and multi-threaded CPU mining.
              </Typography>
              <Typography variant="body2" paragraph>
                This application is designed to provide a user-friendly interface for mining ERC-918
                tokens while maintaining full control over mining parameters and blockchain interactions.
              </Typography>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Box>
              <Typography variant="h6" gutterBottom>
                Links
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button
                  variant="text"
                  onClick={() => window.electronAPI.openExternal('https://eristoken.com/')}
                  sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                >
                  Website
                </Button>
                <Button
                  variant="text"
                  onClick={() => window.electronAPI.openExternal('https://github.com/eristoken')}
                  sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                >
                  GitHub
                </Button>
                <Button
                  variant="text"
                  onClick={() => window.electronAPI.openExternal('https://x.com/eris_token')}
                  sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                >
                  X (Twitter)
                </Button>
                <Button
                  variant="text"
                  onClick={() => window.electronAPI.openExternal('https://bsky.app/profile/eristoken.bsky.social')}
                  sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                >
                  Bluesky
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

export default About;


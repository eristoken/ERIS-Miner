# ERIS Token Miner

A CPU mining application for the ERIS token built with Electron, React, and TypeScript. This application implements the EIP-918 mineable token standard for mining ERIS tokens across multiple supported chains.

## Features

- **CPU Mining**: Maximum compatibility with CPU-based proof-of-work mining
- **Multi-Chain Support**: Mine on Ethereum, Base, Polygon, Arbitrum, BNB Chain, and their testnets
- **GUI-Based**: User-friendly Electron application with React interface
- **RPC Management**: Add, remove, and manage RPC endpoints for each chain via GUI
- **Auto-Failover**: Automatically switches to backup RPCs on failure (configurable cooldown)
- **Rate Limiting**: Configurable rate limiter for RPC calls (default 200ms, can be disabled)
- **Real-Time Stats**: View mining statistics including hash rate, solutions found, successful mints, and more
- **Settings Persistence**: All settings saved to `settings.json`

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ERIS-Miner
```

2. Install dependencies:
```bash
npm install
```

3. Build the Electron application:
```bash
npm run build:electron
```

## Development

Run the development server:
```bash
npm run dev
```

This will start both the Vite dev server and Electron application.

## Building

Build the application for production:
```bash
npm run build
```

## Configuration

### Initial Setup

1. The application requires a `settings.json` file. On first run, you'll need to configure:
   - **Public Address**: Your Ethereum address (0x...)
   - **Private Key**: Your private key (keep this secure!)
   - **Contract Address**: The ERIS token contract address for your selected chain
   - **Chain Selection**: Choose from supported chains in the dropdown

### Settings File

Settings are stored in `settings.json` with the following structure:

```json
{
  "mining_account_public_address": "0x...",
  "mining_account_private_key": "0x...",
  "mining_style": "solo",
  "contract_address": "0x...",
  "pool_url": "",
  "gas_price_gwei": "1000000000",
  "priority_gas_fee_gwei": "1000000000",
  "cpu_thread_count": 1,
  "web3provider": "",
  "rate_limiter_ms": 200,
  "auto_failover_cooldown_seconds": 20,
  "selected_chain": "84532"
}
```

**Note**: Gas prices are stored in wei internally, but the GUI allows input in Gwei (including values below 1, e.g., 0.00000005 Gwei).

### RPC Configuration

RPC endpoints are managed via the GUI in the "RPCs" tab. You can:
- Add new RPC endpoints for any chain
- Remove existing RPC endpoints
- Changes are saved to `rpcs.json`

### Chains Configuration

Supported chains are defined in `chains.json`. The default chains include:
- Ethereum Mainnet (1)
- BNB Chain (56)
- Polygon (137)
- Arbitrum One (42161)
- Base (8453)
- Base Sepolia (84532)
- Ethereum Sepolia (11155111)

## Mining

### Starting Mining

1. Configure your settings (public address, private key, contract address, chain)
2. Optionally configure RPC endpoints for your selected chain
3. Click "Start Mining" in the Mining Dashboard

### Mining Statistics

The dashboard displays:
- **Hash Rate**: Current hashes per second
- **Total Hashes**: Cumulative hash count
- **Solutions Found**: Number of valid PoW solutions found
- **Successful Mints**: Number of successful token mints
- **Failed Mints**: Number of failed mint attempts
- **Current Difficulty**: Current mining difficulty
- **Current Target**: Current mining target
- **Current Challenge**: Current PoW challenge number
- **Epoch**: Current mining epoch
- **Last Solution**: Timestamp of last solution found
- **Last Mint**: Timestamp of last successful mint
- **Current RPC**: Currently connected RPC endpoint
- **RPC Failures**: Number of RPC connection failures

## Features in Detail

### Rate Limiting

The rate limiter prevents overwhelming RPC endpoints with too many requests. By default, it waits 200ms between RPC calls. Set to 0 to disable rate limiting.

### Auto-Failover

When an RPC fails, the miner automatically switches to the next RPC in the list after a cooldown period (default 20 seconds). This ensures continuous mining even if one RPC goes down.

### CPU Thread Count

Configure the number of CPU threads to use for mining. The default is 1, but you can increase this based on your CPU cores (shown in the settings).

## Security Notes

- **Private Key**: Your private key is stored in `settings.json` in plain text. Keep this file secure and never commit it to version control.
- **Network Security**: Only use trusted RPC endpoints. Malicious RPCs could potentially intercept your transactions.

## License

MIT License - See LICENSE file for details.

## Credits

Based on the EIP-918 mineable token standard and inspired by the 0xBitcoin miner implementation.


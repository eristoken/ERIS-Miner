# $ERIS Token Official GUI Miner

A modern, cross-platform desktop application for mining ERC-918 compliant tokens using Electron, React, TypeScript, and Material-UI.

## Features

- **ERC-918 Compliant**: Full support for the ERC-918 Mineable Token Standard
- **Multi-Chain Support**: Configure and mine on multiple blockchain networks
- **RPC Management**: Add, remove, and manage RPC endpoints with automatic failover
- **Rate Limiting**: Configurable RPC rate limiting to prevent API throttling
- **Auto RPC Switching**: Automatically switch to backup RPCs when rate limited (solo mode)
- **Multi-Threading**: Configurable CPU thread count for parallel mining
- **Real-Time Stats**: Live mining statistics including hash rate, solutions found, and tokens minted
- **Console Logging**: Clearable console with filtered log output
- **Modern UI**: Beautiful Material-UI interface with dark theme

## Requirements

- Node.js >= 18.0
- npm or yarn

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

## Development

Run the application in development mode:

```bash
npm run dev
```

This will:
- Start the Vite dev server for React (http://localhost:5173)
- Launch Electron with hot-reload enabled

## Building

Build the application for production:

```bash
npm run build
```

This will:
- Build the React application
- Compile the Electron main process

## Configuration

### Settings

The application stores configuration in `settings.json` (located in the Electron user data directory):

```json
{
  "mining_account_public_address": "0x...",
  "mining_account_private_key": "0x...",
  "network_type": "mainnet",
  "gas_price_gwei": 1,
  "priority_gas_fee_gwei": 1,
  "gas_limit": 200000,
  "cpu_thread_count": 1,
  "rpc_rate_limit_ms": 200,
  "rpc_switch_delay_seconds": 20,
  "selected_chain_id": "8453"
}
```

### Supported Chains

Chains are defined in `chains.json`. The default configuration includes:
- Ethereum Mainnet (1)
- Base (8453)
- Arbitrum One (42161)
- Polygon (137)
- BNB Chain (56)
- Ink (57073)
- Unichain (130)
- World Chain (480)
- Soneium (1868)

### RPC Endpoints

RPC endpoints are organized by chain in `rpcs.json`. You can add/remove RPCs through the UI.

## Usage

1. **Configure Settings**: Go to the Settings page and configure:
   - Mining account (public address and private key)
   - Network (mainnet or testnet)
   - Gas prices (can be less than 1 gwei, specified in wei)
   - Gas limit (default: 200000)
   - CPU thread count
   - RPC rate limit (0 to disable)
   - RPC switch delay

2. **Manage RPCs**: Go to the RPCs page to:
   - Add new RPC endpoints for each chain
   - Remove existing RPCs
   - View current RPC configuration

3. **Start Mining**: Go to the Home page and click "Start Mining"

4. **Monitor Progress**: View real-time statistics on the Home page and check logs in the Console

## Mining Algorithm

The miner implements the ERC-918 standard:

1. Fetches the current challenge number from the contract
2. Calculates `keccak256(challengeNumber, minterAddress, nonce)`
3. Checks if the hash value is less than or equal to the mining target
4. Submits valid solutions to the contract's `mint()` function

## RPC Rate Limiting

- **Rate Limit**: Configurable delay between RPC calls (default: 200ms, set to 0 to disable)
- **Auto-Switch**: Automatically switches to the next RPC when rate limited
- **Switch Delay**: Configurable delay before switching RPCs (default: 20 seconds)

## Gas Fees

Gas prices can be configured in gwei, but support values less than 1 gwei. The application converts these to wei internally for transaction submission.

## Security Notes

- **Private Keys**: Private keys are stored in plaintext in `settings.json`. Keep this file secure!
- **RPC Endpoints**: Use trusted RPC endpoints. Public RPCs may have rate limits or security concerns.

## License

MIT License

## Contributing

Contributions are welcome! Please ensure your code follows the existing style and includes appropriate tests.


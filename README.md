# $ERIS Token Official GUI Miner

A modern, cross-platform desktop application for mining ERC-918 compliant tokens using Electron, React, TypeScript, and Material-UI.

## Features

- **ERC-918 Compliant**: Full support for the ERC-918 Mineable Token Standard
- **Solo Mining**: Direct contract mining with automatic solution submission
- **Multi-Chain Support**: Configure and mine on multiple blockchain networks
- **CPU Mining**: Multi-threaded CPU mining with configurable thread count
- **GPU Mining**: WebGPU-accelerated mining for massively parallel hashing (10-100x faster than CPU)
- **RPC Management**: Add, remove, and manage RPC endpoints with automatic failover
- **Rate Limiting**: Configurable RPC rate limiting to prevent API throttling
- **Auto RPC Switching**: Automatically switch to backup RPCs when rate limited
- **Real-Time Stats**: Live mining statistics including hash rate, solutions found, and tokens minted
- **Reward Tiers**: Track special reward tiers (Enigma23, ErisFavor, DiscordianBlessing, DiscordantMine, NeutralMine)
- **Leaderboard**: View mining statistics and rankings on the Stats page
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

## Packaging

Package the application for distribution:

```bash
# Package for current platform
npm run package

# Package for specific platform
npm run package:mac   # macOS
npm run package:win   # Windows
```

Create distributable installers:

```bash
# Create installer for current platform
npm run make

# Create installer for specific platform
npm run make:mac     # macOS (DMG)
npm run make:win     # Windows (MSI)
npm run make:linux   # Linux (for Flatpak bundling)
```

See [PACKAGING.md](./PACKAGING.md) for detailed packaging instructions and GitHub Actions workflows.

## CI/CD

The project uses GitHub Actions for automated building and releases:

- **Trigger**: Automatically runs on push to `main` branch, or manually via workflow dispatch
- **Build**: Compiles the React app and Electron main process on Ubuntu
- **Package**: Creates platform-specific installers (DMG for macOS, MSI for Windows, Flatpak for Linux)
- **Release**: Automatically publishes a GitHub release with all platform artifacts

Artifacts are versioned using the version from `package.json`.

## Configuration

### Settings

The application stores configuration in `settings.json` (located in the Electron user data directory):

```json
{
  "mining_account_public_address": "0x...",
  "mining_account_private_key": "0x...",
  "network_type": "mainnet",
  "selected_chain_id": "8453",
  "gas_price_gwei": 1,
  "priority_gas_fee_gwei": 0.1,
  "gas_limit": 200000,
  "cpu_thread_count": 8,
  "gpu_mining_enabled": true,
  "gpu_workgroup_size": 256,
  "rpc_rate_limit_ms": 200,
  "submission_rate_limit_ms": 1000,
  "challenge_poll_interval_ms": 2000,
  "rpc_switch_delay_seconds": 20
}
```

### Settings Reference

| Setting | Description | Default |
|---------|-------------|---------|
| `mining_account_public_address` | Your wallet address that will receive mined tokens | - |
| `mining_account_private_key` | Private key for signing mint transactions | - |
| `network_type` | Contract network: `mainnet`, `testnet`, or `devnet` | `mainnet` |
| `selected_chain_id` | Blockchain chain ID (e.g., `8453` for Base) | `8453` |
| `gas_price_gwei` | Maximum gas price in gwei (supports decimals) | `1` |
| `priority_gas_fee_gwei` | Priority fee/tip in gwei (supports decimals) | `0.1` |
| `gas_limit` | Gas limit for mint transactions | `200000` |
| `cpu_thread_count` | Number of CPU threads for mining | `1` |
| `gpu_mining_enabled` | Enable WebGPU-accelerated mining | `false` |
| `gpu_workgroup_size` | GPU workgroup size (64-1024, must be power of 2) | `256` |
| `rpc_rate_limit_ms` | Minimum delay between RPC calls (0 to disable) | `200` |
| `submission_rate_limit_ms` | Delay between solution submissions | `1000` |
| `challenge_poll_interval_ms` | Interval for polling new challenges | `2000` |
| `rpc_switch_delay_seconds` | Delay before switching RPCs when rate limited | `20` |

### Supported Chains

Chains are defined in `chains.json`. The default configuration includes:
- Ethereum Mainnet (1)
- Base (8453)
- Arbitrum One (42161)
- Polygon (137)
- BNB Chain (56)

### RPC Endpoints

RPC endpoints are organized by chain in `rpcs.json`. You can add/remove RPCs through the UI.

## Usage

1. **Configure Settings**: Go to the Settings page and configure:
   - Mining account (public address and private key)
   - Network (mainnet, testnet, or devnet)
   - Chain selection (Base, Ethereum, Arbitrum, etc.)
   - Gas prices (supports sub-gwei values like 0.1)
   - Gas limit (default: 200000)
   - CPU thread count (recommended: 80% of available cores)
   - GPU mining (enable if WebGPU is available)
   - RPC rate limits

2. **Manage RPCs**: Go to the RPCs page to:
   - Add new RPC endpoints for each chain
   - Remove existing RPCs
   - View current RPC configuration

3. **Start Mining**: Go to the Home page and click "Start Mining"

4. **Monitor Progress**: 
   - View real-time statistics on the Home page (CPU + GPU hash rates)
   - Check detailed mining stats and leaderboard on the Stats page
   - Review logs in the Console page

## Application Pages

- **Home**: Main mining interface with start/stop controls, real-time statistics (CPU + GPU), and reward tier tracking
- **Stats**: View your mining statistics and compare with other miners on the leaderboard
- **Settings**: Configure mining account, gas fees, CPU threads, GPU mining, and RPC rate limits
- **RPCs**: Manage RPC endpoints for each supported chain
- **Console**: View and filter mining logs with clearable console output
- **About**: Application information and version details

## Mining Algorithm

The miner implements the ERC-918 standard for **solo mining**:

1. Fetches the current challenge number from the contract
2. Calculates `keccak256(challengeNumber, minterAddress, nonce)`
3. Checks if the hash value is less than or equal to the mining target
4. Submits valid solutions to the contract's `mint()` function

**Note**: Pool mining is not currently implemented. The application only supports solo mining mode where solutions are submitted directly to the contract.

## GPU Mining

The miner supports GPU-accelerated mining using **WebGPU** compute shaders for massively parallel Keccak256 hashing.

### Requirements

- A browser/Electron version with WebGPU support
- A GPU with WebGPU-compatible drivers
- The Settings page will show "WebGPU Available" if your system supports it

### How It Works

GPU mining runs alongside CPU mining for maximum hash rate:

1. **Compute Shaders**: Full Keccak256 implementation runs entirely on the GPU
2. **Parallel Processing**: Processes thousands of nonces simultaneously (workgroup size × 4 per batch)
3. **Solution Detection**: GPU checks if hash ≤ target and reports valid solutions
4. **Combined Stats**: Hash rate shows both CPU and GPU contributions

### Configuration

Enable GPU mining in the Settings page:

- **Enable GPU Mining**: Toggle to activate WebGPU mining
- **GPU Workgroup Size**: Number of parallel threads per workgroup (64-1024)
  - Higher values = more parallel hashing, but limited by GPU capabilities
  - The app auto-detects your GPU's maximum and adjusts if needed
  - Recommended: Start with 256, increase if stable

### Performance Tips

- GPU mining can be 10-100x faster than CPU depending on your hardware
- Run both CPU and GPU mining for maximum hash rate
- Monitor the Console page for GPU-related messages
- If GPU mining causes issues, disable it and use CPU-only mode

## Reward Tiers

The miner tracks special reward tiers based on solution difficulty:
- **Enigma23**: Highest tier reward
- **ErisFavor**: High tier reward
- **DiscordianBlessing**: Medium-high tier reward
- **DiscordantMine**: Medium tier reward
- **NeutralMine**: Standard tier reward

Reward tier counts are displayed on the Home page and included in your mining statistics.

## RPC Rate Limiting

- **Rate Limit**: Configurable delay between RPC calls (default: 200ms, set to 0 to disable)
- **Auto-Switch**: Automatically switches to the next RPC when rate limited
- **Switch Delay**: Configurable delay before switching RPCs (default: 20 seconds)

## Gas Fees

Gas prices can be configured in gwei, but support values less than 1 gwei. The application converts these to wei internally for transaction submission.

## Security Notes

- **Private Keys**: Private keys are stored in plaintext in `settings.json`. Keep this file secure!
- **RPC Endpoints**: Use trusted RPC endpoints. Public RPCs may have rate limits or security concerns.
- **Network Security**: Ensure you're using the correct network (mainnet/testnet) for your mining account.

## Additional Documentation

- [PACKAGING.md](./PACKAGING.md) - Detailed packaging and distribution instructions
- [CODE_SIGNING.md](./CODE_SIGNING.md) - Code signing setup for macOS and Windows
- [POOL_MINING_VALIDATION.md](./POOL_MINING_VALIDATION.md) - Pool mining implementation status
- [THREAD_COUNT_AUDIT.md](./THREAD_COUNT_AUDIT.md) - Thread count configuration details

## License

MIT License

## Contributing

Contributions are welcome! Please ensure your code follows the existing style and includes appropriate tests.


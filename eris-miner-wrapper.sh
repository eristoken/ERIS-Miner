#!/bin/bash
# Wrapper script for ERIS Miner that forces X11 on Wayland systems
# This ensures the window appears correctly on Raspberry Pi and other Linux systems

# Force X11 if Wayland is detected
if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    export XDG_SESSION_TYPE=x11
    unset WAYLAND_DISPLAY
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Find the actual eris-miner executable
# In packaged app, it's usually in /usr/lib/eris-miner/eris-miner
# Or in the same directory as this script
if [ -f "/usr/lib/eris-miner/eris-miner" ]; then
    EXECUTABLE="/usr/lib/eris-miner/eris-miner"
elif [ -f "$SCRIPT_DIR/eris-miner" ]; then
    EXECUTABLE="$SCRIPT_DIR/eris-miner"
else
    # Try to find it in PATH
    EXECUTABLE=$(which eris-miner 2>/dev/null)
    if [ -z "$EXECUTABLE" ]; then
        echo "Error: eris-miner executable not found"
        exit 1
    fi
fi

# Launch the application
exec "$EXECUTABLE" "$@"


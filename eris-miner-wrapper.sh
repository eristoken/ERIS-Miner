#!/bin/bash
# Wrapper script for ERIS Miner that forces X11 on Wayland systems
# This ensures the window appears correctly on Raspberry Pi and other Linux systems

# Force X11 if Wayland is detected - must be set BEFORE Electron starts
if [ "$XDG_SESSION_TYPE" = "wayland" ] || [ -z "$XDG_SESSION_TYPE" ]; then
    export XDG_SESSION_TYPE=x11
    unset WAYLAND_DISPLAY
fi

# Find the actual eris-miner executable
# In packaged app, it's usually in /usr/lib/eris-miner/eris-miner
if [ -f "/usr/lib/eris-miner/eris-miner" ]; then
    EXECUTABLE="/usr/lib/eris-miner/eris-miner"
else
    # Try to find it in PATH (for development or alternative installs)
    EXECUTABLE=$(which eris-miner 2>/dev/null)
    if [ -z "$EXECUTABLE" ]; then
        echo "Error: eris-miner executable not found" >&2
        exit 1
    fi
fi

# Launch the application with the environment set
exec "$EXECUTABLE" "$@"


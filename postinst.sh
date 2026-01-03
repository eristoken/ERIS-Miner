#!/bin/bash
# Post-install script for ERIS Miner DEB package
# Modifies the desktop file to force X11 on Wayland systems

DESKTOP_FILE="/usr/share/applications/eris-miner.desktop"

if [ -f "$DESKTOP_FILE" ]; then
    # Check if Exec line already has XDG_SESSION_TYPE
    if ! grep -q "XDG_SESSION_TYPE=x11" "$DESKTOP_FILE"; then
        # Modify the Exec line to include XDG_SESSION_TYPE=x11
        sed -i 's|^Exec=\(.*\)|Exec=env XDG_SESSION_TYPE=x11 \1|' "$DESKTOP_FILE"
        echo "Modified desktop file to force X11 on Wayland systems"
    fi
else
    echo "Warning: Desktop file not found at $DESKTOP_FILE"
fi

# Update desktop database
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database /usr/share/applications 2>/dev/null || true
fi

exit 0


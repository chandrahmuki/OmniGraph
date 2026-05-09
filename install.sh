#!/usr/bin/env bash
# OmniGraph installation script
# Installs: CLI symlink, bash completion, pre-commit hook

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${HOME}/.local/bin"

echo "🔧 OmniGraph Installer\n"

# Create bin directory
mkdir -p "$BIN_DIR"

# Symlink CLI
if [ -f "$SCRIPT_DIR/omnigraph.ts" ]; then
  ln -sf "$SCRIPT_DIR/omnigraph.ts" "$BIN_DIR/omnigraph"
  echo "✓ CLI installed: $BIN_DIR/omnigraph"
else
  echo "✗ omnigraph.ts not found in $SCRIPT_DIR"
  exit 1
fi

# Install bash completion
if [ -f "$SCRIPT_DIR/completion/omnigraph" ]; then
  if [ -d "$HOME/.bash_completion.d" ]; then
    cp "$SCRIPT_DIR/completion/omnigraph" "$HOME/.bash_completion.d/omnigraph"
    echo "✓ Bash completion installed: $HOME/.bash_completion.d/omnigraph"
  elif [ -f "/etc/bash_completion" ]; then
    sudo cp "$SCRIPT_DIR/completion/omnigraph" "/etc/bash_completion.d/omnigraph" 2>/dev/null || \
      echo "⚠  Could not install system completion (sudo required)"
  else
    echo "⚠  Bash completion available at: $SCRIPT_DIR/completion/omnigraph"
    echo "   Source it from your .bashrc:"
    echo "   source $SCRIPT_DIR/completion/omnigraph"
  fi
fi

# Install pre-commit hook
if [ -f "$SCRIPT_DIR/hooks/pre-commit" ] && [ -d "$SCRIPT_DIR/.git" ]; then
  ln -sf "$SCRIPT_DIR/hooks/pre-commit" "$SCRIPT_DIR/.git/hooks/pre-commit"
  echo "✓ Pre-commit hook installed"
fi

# Check if in PATH
if command -v omnigraph &> /dev/null; then
  echo ""
  echo "✓ OmniGraph is in PATH"
  omnigraph --help | head -5
else
  echo ""
  echo "⚠  $BIN_DIR is not in your PATH"
  echo "   Add this to your .bashrc or .zshrc:"
  echo "   export PATH=\"$BIN_DIR:\$PATH\""
fi

echo ""
echo "🎉 Installation complete!"

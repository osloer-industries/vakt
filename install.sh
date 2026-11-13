#!/usr/bin/env bash
# One-line installer for vakt
# Usage: curl -fsSL https://raw.githubusercontent.com/yourorg/vakt/main/install.sh | bash

set -euo pipefail

REPO_URL="https://github.com/yourorg/vakt"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.vakt}"
AGENTS_DIR="${AGENTS_DIR:-$HOME/.agents}"

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
CYAN='\033[0;36m'; DIM='\033[2m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}✓${RESET} $*"; }
info() { echo -e "${CYAN}→${RESET} $*"; }

echo ""
echo -e "${BOLD}vakt installer${RESET}"
echo ""

check_deps() {
  local missing=()
  command -v git   &>/dev/null || missing+=("git")
  command -v python3 &>/dev/null || missing+=("python3")
  
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo -e "${YELLOW}Missing dependencies: ${missing[*]}${RESET}"
    echo ""
    echo "Install them with:"
    if [[ "$OSTYPE" == "darwin"* ]]; then
      echo "  brew install ${missing[*]}"
    elif [[ "$OSTYPE" == "linux"* ]]; then
      echo "  sudo apt install ${missing[*]}"
    fi
    exit 1
  fi
}

install() {
  info "Checking dependencies..."
  check_deps
  ok "Dependencies satisfied"
  
  echo ""
  info "Installing vakt..."
  
  if [[ -d "$INSTALL_DIR" ]]; then
    info "Updating existing installation..."
    git -C "$INSTALL_DIR" pull
  else
    info "Cloning repository..."
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  ok "Installed to $INSTALL_DIR"
  
  echo ""
  info "Setting up CLI..."
  
  local bin_link="/usr/local/bin/vakt"
  if [[ -w "/usr/local/bin" ]]; then
    ln -sf "$INSTALL_DIR/src/vakt.sh" "$bin_link"
    ok "Linked CLI to $bin_link"
  else
    echo ""
    echo -e "${YELLOW}Note: Add to your shell config:${RESET}"
    echo -e "  ${DIM}export PATH=\"\$PATH:$INSTALL_DIR/src\"${RESET}"
    echo ""
    echo "Or run:"
    echo -e "  ${DIM}sudo ln -s $INSTALL_DIR/src/vakt.sh /usr/local/bin/vakt${RESET}"
  fi
  
  echo ""
  info "Setting up shell completion..."
  for shell in bash zsh fish; do
    local comp_dir=""
    case "$shell" in
      bash) comp_dir="$HOME/.bash_completion.d" ;;
      zsh)  comp_dir="$HOME/.zsh/completion" ;;
      fish) comp_dir="$HOME/.config/fish/completions" ;;
      *)
        echo "ERROR: unexpected shell for completion: $shell" >&2
        exit 1
        ;;
    esac
    if [[ -d "$(dirname "$comp_dir")" ]]; then
      mkdir -p "$comp_dir"
      cat > "$comp_dir/vakt" << 'COMPLETION'
_agents_mcp_completion() {
  local cur prev words cword
  _init_completion || return
  case $prev in
    vakt)
      COMPREPLY=($(compgen -W "init sync secrets config add-server add-skill list upgrade" -- "$cur"))
      ;;
    secrets)
      COMPREPLY=($(compgen -W "set get delete list" -- "$cur"))
      ;;
    config)
      COMPREPLY=($(compgen -W "get set list" -- "$cur"))
      ;;
  esac
}
complete -F _agents_mcp_completion vakt
COMPLETION
      ok "Installed $shell completion"
    fi
  done
  
  echo ""
  echo -e "${BOLD}Installation complete!${RESET}"
  echo ""
  echo "Next steps:"
  echo ""
  echo "  1. Initialize:"
  echo -e "     ${CYAN}vakt init${RESET}"
  echo ""
  echo "  2. Configure paths in ~/.agents/config.json"
  echo ""
  echo "  3. Add your secrets:"
  echo -e "     ${CYAN}vakt secrets${RESET}"
  echo ""
  echo "  4. Sync to all providers:"
  echo -e "     ${CYAN}vakt sync${RESET}"
  echo ""
}

uninstall() {
  echo "Uninstalling vakt..."
  rm -rf "$INSTALL_DIR"
  rm -f "/usr/local/bin/vakt"
  echo "Done. Your ~/.agents/ directory was preserved."
}

case "${1:-install}" in
  install)  install ;;
  uninstall) uninstall ;;
  *)
    echo "Usage: $0 [install|uninstall]"
    exit 1
    ;;
esac

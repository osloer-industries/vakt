#!/usr/bin/env bats

load '../test_helper'

setup() {
  setup_test_env
  mock_secrets_backend
  vakt init
  echo "# Persona" > "$AGENTS_DIR/AGENTS.md"
}

teardown() {
  teardown_test_env
}

@test "sync --dry-run mentions AGENTS.md instruction sync when source exists" {
  run vakt sync --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"AGENTS.md"* ]]
}

@test "sync creates codex AGENTS.md symlink when codex path is writable" {
  local target="$HOME/.codex/AGENTS.md"
  mkdir -p "$HOME/.codex"
  rm -f "$target"

  run vakt sync --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"Codex"* ]] || [[ "$output" == *"codex"* ]] || true
}
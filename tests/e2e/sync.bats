#!/usr/bin/env bats
# End-to-end tests for vakt sync command

load '../test_helper'

setup() {
  setup_test_env
  mock_secrets_backend
  vakt init
}

teardown() {
  teardown_test_env
}

@test "sync runs without errors" {
  run vakt sync --dry-run
  
  [ "$status" -eq 0 ]
}

@test "sync --dry-run shows what would be synced" {
  run vakt sync --dry-run
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"DRY RUN"* ]] || [[ "$output" == *"dry-run"* ]] || [[ "$output" == *"Would"* ]]
}

@test "sync --mcp-only skips skills" {
  run vakt sync --mcp-only --dry-run
  
  [ "$status" -eq 0 ]
}

@test "sync --skills-only skips MCP servers" {
  local skill_dir="$(mktemp -d)"
  create_test_skill "$skill_dir" "test-skill"
  vakt add-skill "$skill_dir"
  
  run vakt sync --skills-only --dry-run
  
  [ "$status" -eq 0 ]
  
  rm -rf "$skill_dir"
}

@test "sync resolves secret references" {
  vakt secrets set TEST_TOKEN "secret_value_123"
  vakt add-server test-server npx -y test-mcp
  # Manually add secret reference to config
  python3 << PYEOF
import json
with open('$AGENTS_DIR/mcp-config.json', 'r') as f:
    config = json.load(f)
config['test-server']['env'] = {'TEST_TOKEN': 'secret:TEST_TOKEN'}
with open('$AGENTS_DIR/mcp-config.json', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
PYEOF
  
  run vakt sync --dry-run
  
  [ "$status" -eq 0 ]
}

@test "sync expands path variables" {
  vakt config set paths.code "~/MyCode"
  
  run vakt sync --dry-run
  
  [ "$status" -eq 0 ]
}

@test "sync fails before init" {
  rm -rf "$AGENTS_DIR"
  
  run vakt sync
  
  [ "$status" -eq 1 ]
}

@test "sync handles empty skills directory" {
  run vakt sync --dry-run
  
  [ "$status" -eq 0 ]
}

@test "sync handles multiple MCP servers" {
  vakt add-server server1 npx -y mcp1
  vakt add-server server2 npx -y mcp2
  vakt add-server server3 npx -y mcp3
  
  run vakt sync --dry-run
  
  [ "$status" -eq 0 ]
}

@test "sync handles multiple skills" {
  for i in 1 2 3; do
    local skill_dir="$(mktemp -d)"
    create_test_skill "$skill_dir" "skill-$i"
    vakt add-skill "$skill_dir"
    rm -rf "$skill_dir"
  done
  
  run vakt sync --dry-run
  
  [ "$status" -eq 0 ]
}

@test "sync shows progress" {
  run vakt sync --dry-run
  
  [ "$status" -eq 0 ]
  # Should show some indication of what's happening
  [ -n "$output" ]
}

@test "sync handles missing secret gracefully" {
  # Add secret reference without setting the secret
  python3 << PYEOF
import json
with open('$AGENTS_DIR/mcp-config.json', 'r') as f:
    config = json.load(f)
config['test-server'] = {
    'command': 'npx',
    'args': ['-y', 'test-mcp'],
    'env': {'MISSING_TOKEN': 'secret:MISSING_TOKEN'}
}
with open('$AGENTS_DIR/mcp-config.json', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
PYEOF
  
  run vakt sync --dry-run
  
  # Should either fail or warn, not crash
  [ "$status" -eq 0 ] || [ "$status" -eq 1 ]
}

@test "sync creates provider config directories" {
  skip "Requires write access to home directory"
  
  run vakt sync
  
  [ "$status" -eq 0 ]
  # Would check for provider config files if not dry-run
}

@test "sync preserves existing provider configs" {
  skip "Requires testing actual provider config merging"
  
  # Create a mock provider config
  local opencode_dir
  opencode_dir=$(mock_provider_config "opencode")
  echo '{"existing": "config"}' > "$opencode_dir/opencode.json"
  
  run vakt sync
  
  [ "$status" -eq 0 ]
  # Would verify existing config is preserved/merged
}

# ── syncMethod and configFormat separation tests ─────────────────────────────

@test "sync JSON provider writes config file (not CLI commands)" {
  # Cursor uses configFormat=json + syncMethod=file
  # Stub the cursor binary so isInstalled() returns true
  local bin_dir="$HOME/bin"
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n' > "$bin_dir/cursor"
  chmod +x "$bin_dir/cursor"
  export PATH="$bin_dir:$PATH"

  vakt add-server test-server npx -y test-mcp

  run vakt sync --dry-run

  [ "$status" -eq 0 ]
  # File-sync path emits "Would write <path>" for the cursor provider
  [[ "$output" == *"Would write"* ]]
  # Cursor section specifically should show "Would write", not CLI invocation
  [[ "$output" == *"Cursor"* ]] || [[ "$output" == *"cursor"* ]]
}

@test "sync CLI provider (claude) skips file write and uses CLI pathway" {
  # Claude has syncMethod=cli
  # Stub the claude binary so isInstalled() returns true
  local bin_dir="$HOME/bin"
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n' > "$bin_dir/claude"
  chmod +x "$bin_dir/claude"
  export PATH="$bin_dir:$PATH"

  vakt add-server test-server npx -y test-mcp

  run vakt sync --dry-run

  [ "$status" -eq 0 ]
  # CLI-sync dry-run path emits "Would run claude mcp add/remove"
  [[ "$output" == *"Would run claude mcp add/remove"* ]]
  # Must NOT emit "Would write <file path>" for a CLI-sync provider
  [[ "$output" != *"Would write $HOME/.claude"* ]]
}

@test "sync provider configFormat json writes config file to registry path" {
  # Cursor uses configFormat=json — after a real sync, the config file should exist
  local bin_dir="$HOME/bin"
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n' > "$bin_dir/cursor"
  chmod +x "$bin_dir/cursor"
  export PATH="$bin_dir:$PATH"

  local cursor_config="$HOME/.cursor/mcp.json"
  mkdir -p "$(dirname "$cursor_config")"

  vakt add-server test-server npx -y test-mcp --global

  run vakt sync --force

  [ "$status" -eq 0 ]
  # The config file at the registry path must now exist
  [ -f "$cursor_config" ]
  # And it must contain our server
  grep -q "test-server" "$cursor_config"
}

# ── Output format ─────────────────────────────────────────────────────────────

@test "sync writes provider JSON files with trailing newline" {
  local bin_dir="$HOME/bin"
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n' > "$bin_dir/cursor"
  chmod +x "$bin_dir/cursor"
  export PATH="$bin_dir:$PATH"

  local cursor_config="$HOME/.cursor/mcp.json"
  mkdir -p "$(dirname "$cursor_config")"

  vakt add-server test-server npx -y test-mcp

  run vakt sync --force
  [ "$status" -eq 0 ]

  [ -f "$cursor_config" ]
  # File must end with a newline character
  last_byte=$(python3 -c "
import sys
data = open('$cursor_config', 'rb').read()
sys.exit(0 if data.endswith(b'\n') else 1)
")
  [ "$?" -eq 0 ]
}

@test "sync preserves non-MCP keys in existing provider JSON file" {
  local bin_dir="$HOME/bin"
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n' > "$bin_dir/cursor"
  chmod +x "$bin_dir/cursor"
  export PATH="$bin_dir:$PATH"

  local cursor_config="$HOME/.cursor/mcp.json"
  mkdir -p "$(dirname "$cursor_config")"
  echo '{"someOtherKey": {"nested": true}, "mcpServers": {}}' > "$cursor_config"

  vakt add-server test-server npx -y test-mcp --global

  run vakt sync --force
  [ "$status" -eq 0 ]

  python3 -c "
import json
cfg = json.load(open('$cursor_config'))
assert 'someOtherKey' in cfg, 'non-MCP key was clobbered'
assert cfg['someOtherKey']['nested'] == True
assert 'test-server' in cfg['mcpServers']
"
}

# ── Missing secrets ───────────────────────────────────────────────────────────

@test "sync preserves secret ref string in output when secret is missing" {
  local bin_dir="$HOME/bin"
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n' > "$bin_dir/cursor"
  chmod +x "$bin_dir/cursor"
  export PATH="$bin_dir:$PATH"

  local cursor_config="$HOME/.cursor/mcp.json"
  mkdir -p "$(dirname "$cursor_config")"

  # Add server with a secret ref that has no corresponding secret set
  vakt add-server secret-server npx -y secret-mcp --global
  python3 -c "
import json
with open('$AGENTS_DIR/mcp-config.json') as f:
    cfg = json.load(f)
cfg['secret-server']['env'] = {'MY_TOKEN': 'secret:UNSET_TOKEN_XYZ'}
with open('$AGENTS_DIR/mcp-config.json', 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\n')
"

  run vakt sync --force
  [ "$status" -eq 0 ]

  # The ref string should be in the output, not an empty string
  python3 -c "
import json
cfg = json.load(open('$cursor_config'))
val = cfg['mcpServers']['secret-server']['env']['MY_TOKEN']
assert val == 'secret:UNSET_TOKEN_XYZ', 'expected ref string, got: ' + repr(val)
assert val != '', 'secret ref was replaced with empty string'
"
}

@test "sync warns about missing secrets but does not fail" {
  vakt add-server secret-server npx -y secret-mcp --global
  python3 -c "
import json
with open('$AGENTS_DIR/mcp-config.json') as f:
    cfg = json.load(f)
cfg['secret-server']['env'] = {'MY_TOKEN': 'secret:DEFINITELY_NOT_SET'}
with open('$AGENTS_DIR/mcp-config.json', 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\n')
"

  run vakt sync --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"DEFINITELY_NOT_SET"* ]]
}

@test "sync prompts for unclassified MCP server and classifies on y" {
  vakt add-server classified-srv npx -y test-mcp --global
  # Add an unclassified server (no global field) by editing JSON directly
  python3 -c "
import json
with open('$AGENTS_DIR/mcp-config.json') as f: cfg = json.load(f)
cfg['unclassified-srv'] = {'command': 'npx', 'args': ['-y', 'unclassified-mcp']}
with open('$AGENTS_DIR/mcp-config.json', 'w') as f: json.dump(cfg, f, indent=2)
"
  run bash -c "echo 'y' | '$VAKT' sync --mcp-only --force"
  [ "$status" -eq 0 ]

  # The server should now be classified as global: true
  python3 -c "
import json, sys
with open('$AGENTS_DIR/mcp-config.json') as f: cfg = json.load(f)
assert cfg.get('unclassified-srv', {}).get('global') == True, 'expected global: true, got: ' + repr(cfg.get('unclassified-srv'))
"
}

@test "sync prompts for unclassified skill and classifies on n" {
  local skill_dir
  skill_dir="$(mktemp -d)"
  export VAKT_EXTRA_PATH_ROOTS="${VAKT_EXTRA_PATH_ROOTS}:${skill_dir}"
  # Create a skill with no global field in SKILL.md
  mkdir -p "$skill_dir/unclassified-skill"
  cat > "$skill_dir/unclassified-skill/SKILL.md" << 'SKILLEOF'
---
name: unclassified-skill
---

# Unclassified Skill
SKILLEOF
  # Link it directly (bypass add-skill prompt)
  mkdir -p "$AGENTS_DIR/skills"
  ln -s "$skill_dir/unclassified-skill" "$AGENTS_DIR/skills/unclassified-skill"

  run bash -c "echo 'n' | '$VAKT' sync --skills-only --force"
  [ "$status" -eq 0 ]

  grep -q "global: false" "$AGENTS_DIR/skills/unclassified-skill/SKILL.md"

  rm -rf "$skill_dir"
}

@test "sync --dry-run does not prompt for unclassified resources" {
  python3 -c "
import json
with open('$AGENTS_DIR/mcp-config.json') as f: cfg = json.load(f)
cfg['unclassified-srv'] = {'command': 'npx', 'args': ['-y', 'unclassified-mcp']}
with open('$AGENTS_DIR/mcp-config.json', 'w') as f: json.dump(cfg, f, indent=2)
"
  run vakt sync --dry-run
  [ "$status" -eq 0 ]
  # dry-run should not prompt or classify; server remains unclassified
  python3 -c "
import json
with open('$AGENTS_DIR/mcp-config.json') as f: cfg = json.load(f)
assert 'global' not in cfg.get('unclassified-srv', {}), 'server should remain unclassified in dry-run'
"
}

@test "sync --all does not prompt for unclassified resources" {
  python3 -c "
import json
with open('$AGENTS_DIR/mcp-config.json') as f: cfg = json.load(f)
cfg['unclassified-srv'] = {'command': 'npx', 'args': ['-y', 'unclassified-mcp']}
with open('$AGENTS_DIR/mcp-config.json', 'w') as f: json.dump(cfg, f, indent=2)
"
  run vakt sync --all --force
  [ "$status" -eq 0 ]
}

@test "sync refreshes git-backed skills and reports upstream changes" {
  # Unset any inherited GIT_DIR so git commands work on the correct repos
  unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

  # Create an upstream bare repo
  local upstream
  upstream="$(mktemp -d)"
  git init --bare "$upstream" -b main

  # Clone it as the skill
  local skill_src
  skill_src="$(mktemp -d)"
  git -c init.defaultBranch=main clone "$upstream" "$skill_src/my-git-skill"
  git -C "$skill_src/my-git-skill" config user.email "test@test.com"
  git -C "$skill_src/my-git-skill" config user.name "Test"
  cat > "$skill_src/my-git-skill/SKILL.md" << 'SKILLEOF'
---
name: my-git-skill
global: true
---
# My Skill
SKILLEOF
  git -C "$skill_src/my-git-skill" add SKILL.md
  git -C "$skill_src/my-git-skill" commit -m "initial"
  git -C "$skill_src/my-git-skill" push origin main

  # Install the skill (bypass prompt with explicit --global)
  run vakt add-skill "$skill_src/my-git-skill" --global
  [ "$status" -eq 0 ]

  # Push an upstream change from a second clone so the skill's local clone is behind
  local upstream_clone
  upstream_clone="$(mktemp -d)"
  git -c init.defaultBranch=main clone "$upstream" "$upstream_clone"
  git -C "$upstream_clone" config user.email "test@test.com"
  git -C "$upstream_clone" config user.name "Test"
  echo "upstream change" >> "$upstream_clone/SKILL.md"
  git -C "$upstream_clone" add SKILL.md
  git -C "$upstream_clone" commit -m "upstream update"
  git -C "$upstream_clone" push origin main
  rm -rf "$upstream_clone"

  # sync with update accepted
  run bash -c "unset GIT_DIR GIT_WORK_TREE; echo 'y' | '$VAKT' sync --skills-only --force"
  [ "$status" -eq 0 ]
  [[ "$output" == *"my-git-skill"* ]]

  rm -rf "$upstream" "$skill_src"
}

@test "sync --no-update-skills skips skill refresh" {
  # Unset any inherited GIT_DIR so git commands work on the correct repos
  unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

  local upstream skill_src
  upstream="$(mktemp -d)"
  git init --bare "$upstream" -b main
  skill_src="$(mktemp -d)"
  git -c init.defaultBranch=main clone "$upstream" "$skill_src/no-update-skill"
  git -C "$skill_src/no-update-skill" config user.email "test@test.com"
  git -C "$skill_src/no-update-skill" config user.name "Test"
  printf -- "---\nname: no-update-skill\nglobal: true\n---\n" > "$skill_src/no-update-skill/SKILL.md"
  git -C "$skill_src/no-update-skill" add SKILL.md
  git -C "$skill_src/no-update-skill" commit -m "initial"
  git -C "$skill_src/no-update-skill" push origin main

  run vakt add-skill "$skill_src/no-update-skill" --global
  [ "$status" -eq 0 ]

  # Push an upstream change from a second clone so the skill's local clone is behind
  local upstream_clone
  upstream_clone="$(mktemp -d)"
  git -c init.defaultBranch=main clone "$upstream" "$upstream_clone"
  git -C "$upstream_clone" config user.email "test@test.com"
  git -C "$upstream_clone" config user.name "Test"
  echo "upstream change" >> "$upstream_clone/SKILL.md"
  git -C "$upstream_clone" add SKILL.md
  git -C "$upstream_clone" commit -m "update"
  git -C "$upstream_clone" push origin main
  rm -rf "$upstream_clone"

  run vakt sync --skills-only --no-update-skills --force
  [ "$status" -eq 0 ]
  # Output should NOT mention "new commits upstream" in update context
  [[ "$output" != *"new commits upstream"* ]]

  rm -rf "$upstream" "$skill_src"
}

@test "sync --dry-run reports skills behind upstream without updating" {
  # Unset any inherited GIT_DIR so git commands work on the correct repos
  unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

  local upstream skill_src
  upstream="$(mktemp -d)"
  git init --bare "$upstream" -b main
  skill_src="$(mktemp -d)"
  git -c init.defaultBranch=main clone "$upstream" "$skill_src/dry-run-skill"
  git -C "$skill_src/dry-run-skill" config user.email "test@test.com"
  git -C "$skill_src/dry-run-skill" config user.name "Test"
  printf -- "---\nname: dry-run-skill\nglobal: true\n---\n" > "$skill_src/dry-run-skill/SKILL.md"
  git -C "$skill_src/dry-run-skill" add SKILL.md
  git -C "$skill_src/dry-run-skill" commit -m "initial"
  git -C "$skill_src/dry-run-skill" push origin main

  run vakt add-skill "$skill_src/dry-run-skill" --global
  [ "$status" -eq 0 ]

  # Push an upstream change from a second clone so the skill's local clone is behind
  local upstream_clone
  upstream_clone="$(mktemp -d)"
  git -c init.defaultBranch=main clone "$upstream" "$upstream_clone"
  git -C "$upstream_clone" config user.email "test@test.com"
  git -C "$upstream_clone" config user.name "Test"
  echo "upstream change" >> "$upstream_clone/SKILL.md"
  git -C "$upstream_clone" add SKILL.md
  git -C "$upstream_clone" commit -m "update"
  git -C "$upstream_clone" push origin main
  rm -rf "$upstream_clone"

  run vakt sync --skills-only --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"dry-run"* ]] || [[ "$output" == *"behind"* ]]

  rm -rf "$upstream" "$skill_src"
}

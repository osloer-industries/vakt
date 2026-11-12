/**
 * check-tool-enum.ts
 *
 * Fetches the Claude Code permissions docs and diffs the tool names found
 * against KNOWN_TOOLS in src/lib/schemas.ts. Exits non-zero when they diverge
 * so CI catches new or removed tools before they silently break vakt users.
 *
 * Usage: bun run scripts/check-tool-enum.ts
 */

import { KNOWN_TOOLS } from "../src/lib/schemas";

const DOCS_URL = "https://code.claude.com/docs/en/permissions";

// ── Fetch docs ────────────────────────────────────────────────────────────────

async function fetchDocs(): Promise<string> {
  const res = await fetch(DOCS_URL);
  if (!res.ok) throw new Error(`Failed to fetch ${DOCS_URL}: ${res.status} ${res.statusText}`);
  return res.text();
}

// ── Extract tool names ────────────────────────────────────────────────────────
//
// The permissions page lists tool names in table cells and code blocks in the
// format `ToolName` or `ToolName(specifier)`. We extract the name part only.
//
// Heuristic: match capitalized identifiers that appear as standalone entries
// or as the head of a parenthesised rule in code blocks/table cells.

const TOOL_NAME_RE = /\b([A-Z][A-Za-z0-9]+)(?:\([^)]*\))?(?=\s*[`|,\n]|\s*$)/g;

// Tools that appear in the docs as plain words but are not permission rule names
const FALSE_POSITIVES = new Set([
  "Claude",
  "Code",
  "MCP",        // used as a section heading, not a tool permission name
  "PreToolUse", // hook name
  "Note",
  "Tip",
  "Warning",
  "Tool",
]);

function extractToolNames(html: string): Set<string> {
  // Strip HTML tags to get plain text
  const text = html.replace(/<[^>]+>/g, " ");
  const found = new Set<string>();

  for (const match of text.matchAll(TOOL_NAME_RE)) {
    const name = match[1]!;
    if (!FALSE_POSITIVES.has(name)) found.add(name);
  }

  return found;
}

// ── Diff ──────────────────────────────────────────────────────────────────────

function diff(known: readonly string[], found: Set<string>): { added: string[]; removed: string[] } {
  const knownSet = new Set(known);
  const added   = [...found].filter((t) => !knownSet.has(t)).sort((a, b) => a.localeCompare(b));
  const removed = [...known].filter((t) => !found.has(t)).sort((a, b) => a.localeCompare(b));
  return { added, removed };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Fetching ${DOCS_URL} …`);
  let html: string;
  try {
    html = await fetchDocs();
  } catch (e) {
    console.error(`\n⚠  Could not fetch docs: ${e}`);
    console.error("   Skipping tool enum check (network unavailable).");
    process.exit(0); // Don't fail CI on network errors
  }

  const found = extractToolNames(html);
  const { added, removed } = diff(KNOWN_TOOLS, found);

  if (added.length === 0 && removed.length === 0) {
    console.log(`✓  KNOWN_TOOLS matches docs (${KNOWN_TOOLS.length} tools)`);
    process.exit(0);
  }

  console.error("\n✗  KNOWN_TOOLS has drifted from the Claude Code permissions docs:");
  if (added.length > 0) {
    console.error(`\n  New tools in docs (not in KNOWN_TOOLS):\n    ${added.join(", ")}`);
    console.error("  → Add these to KNOWN_TOOLS in src/lib/schemas.ts");
  }
  if (removed.length > 0) {
    console.error(`\n  Tools in KNOWN_TOOLS not found in docs:\n    ${removed.join(", ")}`);
    console.error("  → Verify these are still valid, then update KNOWN_TOOLS if needed");
  }
  console.error(`\n  Docs URL: ${DOCS_URL}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

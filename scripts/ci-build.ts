#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const TscBin = join(process.cwd(), "node_modules", ".bin", "tsc");

function walkFiles(
  root: string,
  extension: string,
  skipNodeModules: boolean,
): string[] {
  const results: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) {
      continue;
    }
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let stat;
      try {
        stat = lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (skipNodeModules && entry === "node_modules") {
          continue;
        }
        stack.push(full);
      } else if (entry.endsWith(extension)) {
        results.push(full);
      }
    }
  }
  return results;
}

execFileSync(TscBin, ["--noEmit"], { stdio: "inherit" });

for (const file of walkFiles(".", ".json", true)) {
  try {
    JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${file}: ${message}`);
  }
}

const workflowDir = join(".github", "workflows");
for (const file of readdirSync(workflowDir).filter((f) => f.endsWith(".yml"))) {
  const workflowPath = join(workflowDir, file);
  execFileSync(
    "python3",
    ["-c", "import yaml, sys; yaml.safe_load(open(sys.argv[1]))", workflowPath],
    { stdio: "inherit" },
  );
}

for (const file of walkFiles(".", ".sh", true)) {
  execFileSync("bash", ["-n", file], { stdio: "inherit" });
}

for (const skillDir of readdirSync("skills", { withFileTypes: true }).filter((d) =>
  d.isDirectory(),
)) {
  const skillPath = join("skills", skillDir.name);
  const skillMd = join(skillPath, "SKILL.md");
  let content: string;
  try {
    content = readFileSync(skillMd, "utf8");
  } catch {
    throw new Error(`Missing SKILL.md in ${skillPath}/`);
  }
  if (!content.startsWith("---") && !content.includes("\n---")) {
    throw new Error(`Missing YAML frontmatter in ${skillMd}`);
  }
}

execFileSync("bun", ["src/index.ts", "--version"], { stdio: "inherit" });
execFileSync("bun", ["src/index.ts", "--help"], { stdio: "inherit" });

execFileSync("chmod", ["+x", "install.sh"], { stdio: "inherit" });
const installSh = readFileSync("install.sh", "utf8");
if (!installSh.includes("#!/usr/bin/env bash")) {
  throw new Error("install.sh missing bash shebang");
}
if (!installSh.includes("curl") && !installSh.includes("git clone")) {
  throw new Error("install.sh missing curl or git clone");
}
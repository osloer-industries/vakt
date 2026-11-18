#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function run(command: string): void {
  execSync(command, { stdio: "inherit" });
}

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
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
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

run("./node_modules/.bin/tsc --noEmit");

for (const file of walkFiles(".", ".json", true)) {
  run(`python3 -m json.tool "${file}" > /dev/null`);
}

for (const file of readdirSync(".github/workflows").filter((f) => f.endsWith(".yml"))) {
  run(
    `python3 -c 'import yaml, sys; yaml.safe_load(open(sys.argv[1]))' ".github/workflows/${file}"`,
  );
}

for (const file of walkFiles(".", ".sh", true)) {
  run(`bash -n "${file}"`);
}

for (const skillDir of readdirSync("skills", { withFileTypes: true }).filter((d) =>
  d.isDirectory(),
)) {
  const skillPath = join("skills", skillDir.name);
  const skillMd = join(skillPath, "SKILL.md");
  try {
    statSync(skillMd);
  } catch {
    throw new Error(`Missing SKILL.md in ${skillPath}/`);
  }
  const content = readFileSync(skillMd, "utf8");
  if (!content.startsWith("---") && !content.includes("\n---")) {
    throw new Error(`Missing YAML frontmatter in ${skillMd}`);
  }
}

run("bun run src/index.ts --version");
run("bun run src/index.ts --help");

run("chmod +x install.sh");
const installSh = readFileSync("install.sh", "utf8");
if (!installSh.includes("#!/usr/bin/env bash")) {
  throw new Error("install.sh missing bash shebang");
}
const installBody = installSh;
if (!installBody.includes("curl") && !installBody.includes("git clone")) {
  throw new Error("install.sh missing curl or git clone");
}
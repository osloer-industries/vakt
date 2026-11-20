#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ciExecFile, resolveCiBinary } from "./ci-env.ts";
import { walkRepoFiles } from "./ci-fs.ts";

const TscJs = join(process.cwd(), "node_modules", "typescript", "lib", "tsc.js");
const NodeBin = process.execPath;
const BashBin = resolveCiBinary("bash");
const Python3Bin = resolveCiBinary("python3");
const BunBin = resolveCiBinary("bun");
const ChmodBin = resolveCiBinary("chmod");

ciExecFile(NodeBin, [TscJs, "--noEmit"]);

for (const file of walkRepoFiles(".", { extensions: [".json"] })) {
  try {
    JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${file}: ${message}`, { cause: error });
  }
}

const workflowDir = join(".github", "workflows");
for (const file of readdirSync(workflowDir).filter((f) => f.endsWith(".yml"))) {
  const workflowPath = join(workflowDir, file);
  ciExecFile(Python3Bin, [
    "-c",
    "import yaml, sys; yaml.safe_load(open(sys.argv[1]))",
    workflowPath,
  ]);
}

for (const file of walkRepoFiles(".", { extensions: [".sh"] })) {
  ciExecFile(BashBin, ["-n", file]);
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

ciExecFile(BunBin, ["src/index.ts", "--version"]);
ciExecFile(BunBin, ["src/index.ts", "--help"]);

ciExecFile(ChmodBin, ["+x", "install.sh"]);
const installSh = readFileSync("install.sh", "utf8");
if (!installSh.includes("#!/usr/bin/env bash")) {
  throw new Error("install.sh missing bash shebang");
}
if (!installSh.includes("curl") && !installSh.includes("git clone")) {
  throw new Error("install.sh missing curl or git clone");
}
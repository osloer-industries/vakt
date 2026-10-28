export interface RtkWrapOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface RtkWrapResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  tokenSavings?: number;
}

async function runProcess(
  argv: string[],
  opts: { cwd?: string; env?: Record<string, string>; timeoutMs?: number; stdin?: string },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(argv, {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : undefined,
    stdin: opts.stdin === undefined ? undefined : new Blob([opts.stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeoutMs = opts.timeoutMs ?? 60_000;
  const timer = setTimeout(() => proc.kill(), timeoutMs);

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);

  return { stdout, stderr, exitCode };
}

/** Check if RTK is installed and available in PATH. */
export async function isRtkAvailable(): Promise<boolean> {
  try {
    const { exitCode } = await runProcess(["rtk", "--version"], { timeoutMs: 5_000 });
    return exitCode === 0;
  } catch {
    return false;
  }
}

/** Wrap a command with RTK for token compression (`rtk wrap -- <cmd> ...`). */
export async function rtkWrap(options: RtkWrapOptions): Promise<RtkWrapResult> {
  const { command, args = [], cwd, env, timeoutMs } = options;

  if (!(await isRtkAvailable())) {
    const fallback = await runProcess([command, ...args], { cwd, env, timeoutMs });
    return { ...fallback, tokenSavings: undefined };
  }

  const wrapped = await runProcess(["rtk", "wrap", "--", command, ...args], {
    cwd,
    env,
    timeoutMs,
  });

  return {
    ...wrapped,
    tokenSavings: parseTokenSavings(wrapped.stderr),
  };
}

function parseTokenSavings(stderr: string): number | undefined {
  const match = /\[rtk\] Saved (\d+) tokens/.exec(stderr);
  return match ? Number.parseInt(match[1]!, 10) : undefined;
}

/** Compress text via RTK or a basic deduplication fallback. */
export async function compressWithRtk(text: string): Promise<string> {
  if (!(await isRtkAvailable())) {
    return basicDeduplication(text);
  }

  try {
    const { exitCode, stdout } = await runProcess(["rtk", "compress"], {
      stdin: text,
      timeoutMs: 30_000,
    });
    return exitCode === 0 ? stdout : basicDeduplication(text);
  } catch {
    return basicDeduplication(text);
  }
}

function basicDeduplication(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let currentLine = "";
  let repeatCount = 0;

  for (const line of lines) {
    if (line === currentLine) {
      repeatCount++;
    } else {
      if (repeatCount > 1) {
        result.push(`[repeated ${repeatCount} times]`);
      }
      result.push(line);
      currentLine = line;
      repeatCount = 1;
    }
  }

  if (repeatCount > 1) {
    result.push(`[repeated ${repeatCount} times]`);
  }

  return result.join("\n");
}

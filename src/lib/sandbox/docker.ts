import type {
  SandboxProvider, SandboxHandle, SandboxCreateOpts, ExecResult,
} from "../sandbox";
import {
  assertDockerImageRef,
  assertDockerResourceId,
  buildDockerExecStartPath,
  rebuildDockerApiPath,
} from "../safe-input";

interface DockerOpts {
  socket?: string;
  image?:  string;
  memory?: string;
  cpus?:   string;
  network?: "none" | "bridge";
}

function parseMuxStream(buf: ArrayBuffer): { stdout: string; stderr: string } {
  const view = new DataView(buf);
  let stdout = "";
  let stderr = "";
  let offset = 0;
  while (offset + 8 <= buf.byteLength) {
    const type = view.getUint8(offset);
    const size = view.getUint32(offset + 4, false);
    offset += 8;
    const chunk = new TextDecoder().decode(new Uint8Array(buf, offset, size));
    offset += size;
    if (type === 1) stdout += chunk;
    else if (type === 2) stderr += chunk;
  }
  return { stdout, stderr };
}

export class DockerSandboxProvider implements SandboxProvider {
  readonly name = "docker";
  private readonly socket: string;
  private readonly defaultImage: string;
  private readonly memory?: string;
  private readonly cpus?: string;
  private readonly defaultNetwork: "none" | "bridge";

  constructor(opts: DockerOpts = {}) {
    this.socket         = opts.socket  ?? "/var/run/docker.sock";
    this.defaultImage   = opts.image   ?? "node:20-slim";
    this.memory         = opts.memory;
    this.cpus           = opts.cpus;
    this.defaultNetwork = opts.network ?? "none";
  }

  private url(path: string): string {
    return `http://localhost/v1.41${path}`;
  }

  private async dockerFetch(path: string, init: RequestInit): Promise<Response> {
    const safePath = rebuildDockerApiPath(path);
    return fetch(this.url(safePath), {
      ...init,
      // @ts-ignore — Bun extension: unix socket fetch
      unix: this.socket,
    });
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.dockerFetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      throw new Error(`Docker API ${method} ${path} → ${res.status}: ${text}`);
    }
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  private async pullImage(image: string): Promise<void> {
    assertDockerImageRef(image);
    const apiPath = `/images/create?fromImage=${encodeURIComponent(image)}`;
    const res = await this.dockerFetch(apiPath, { method: "POST" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Docker pull ${image} → ${res.status}: ${text}`);
    }
    // Drain the response stream (progress JSON lines) so the pull completes
    await res.text();
  }

  async create(opts: SandboxCreateOpts): Promise<SandboxHandle> {
    const image = opts.image ?? this.defaultImage;
    await this.pullImage(image);

    const labels: Record<string, string> = { "vakt.managed": "true", ...opts.labels };
    if (opts.name) labels["vakt.name"] = opts.name;

    const body: Record<string, unknown> = {
      Image:     image,
      Cmd:       ["/bin/sh"],
      OpenStdin: true,
      Labels:    labels,
      HostConfig: {
        Binds:       opts.repo ? [`${opts.repo}:/workspace:rw`] : [],
        NetworkMode: opts.network ?? this.defaultNetwork,
        ...(this.memory ? { Memory: parseMem(this.memory) } : {}),
        ...(this.cpus   ? { NanoCpus: Math.round(Number.parseFloat(this.cpus) * 1e9) } : {}),
      },
    };
    if (opts.name) body["Name"] = opts.name;

    const { Id } = await this.req<{ Id: string }>("POST", "/containers/create", body);
    assertDockerResourceId(Id);
    await this.req("POST", `/containers/${Id}/start`);
    // Ensure /workspace always exists (may be empty if no repo bind-mounted)
    const handle = { id: Id, provider: this.name };
    await this.exec(handle, ["mkdir", "-p", "/workspace"]);
    return handle;
  }

  async exec(handle: SandboxHandle, cmd: string[], env?: Record<string, string>): Promise<ExecResult> {
    const { Id: execId } = await this.req<{ Id: string }>(
      "POST",
      `/containers/${handle.id}/exec`,
      {
        Cmd:          cmd,
        Env:          env ? Object.entries(env).map(([k, v]) => `${k}=${v}`) : [],
        AttachStdout: true,
        AttachStderr: true,
      },
    );

    const execPath = buildDockerExecStartPath(execId);
    const res = await this.dockerFetch(execPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Detach: false, Tty: false }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Docker API POST ${execPath} → ${res.status}: ${text}`);
    }

    const buf = await res.arrayBuffer();
    const { stdout, stderr } = parseMuxStream(buf);

    const inspect = await this.req<{ ExitCode: number }>("GET", `/exec/${execId}/json`);
    return { stdout, stderr, exitCode: inspect.ExitCode };
  }

  async writeFile(handle: SandboxHandle, path: string, content: string): Promise<void> {
    const b64 = Buffer.from(content).toString("base64");
    // Create parent directory (shell -c is safe here: path comes from mkdirCmd array arg)
    await this.exec(handle, ["sh", "-c", "mkdir -p \"$(dirname \"$1\")\"", "--", path]);
    // Write via printf + base64 -d, all args in array — no shell interpolation of user data
    await this.exec(handle, ["sh", "-c", "printf '%s' \"$1\" | base64 -d > \"$2\"", "--", b64, path]);
  }

  async readFile(handle: SandboxHandle, path: string): Promise<string> {
    const result = await this.exec(handle, ["base64", path]);
    if (result.exitCode !== 0) throw new Error(`readFile failed: ${result.stderr}`);
    return Buffer.from(result.stdout.trim(), "base64").toString("utf8");
  }

  async destroy(handle: SandboxHandle): Promise<void> {
    await this.req("DELETE", `/containers/${handle.id}?force=true`);
  }

  async list(filter: { namePrefix?: string; labels?: Record<string, string> } = {}): Promise<SandboxHandle[]> {
    const labelFilters: string[] = ['"vakt.managed=true"'];
    if (filter.labels) {
      for (const [k, v] of Object.entries(filter.labels)) {
        labelFilters.push(`"${k}=${v}"`);
      }
    }
    const filtersParam = encodeURIComponent(JSON.stringify({ label: labelFilters }));
    const containers = await this.req<Array<{ Id: string; Labels: Record<string, string> }>>(
      "GET", `/containers/json?filters=${filtersParam}`,
    );
    return containers
      .filter(c => !filter.namePrefix || (c.Labels["vakt.name"] ?? "").startsWith(filter.namePrefix))
      .map(c => ({ id: c.Id, provider: this.name }));
  }

  // Swarm extension stub — see #73
  async createMany(opts: SandboxCreateOpts[]): Promise<SandboxHandle[]> {
    // NOTE: parallel create — bulk API optimisation tracked in issue #73
    return Promise.all(opts.map(o => this.create(o)));
  }
}

function parseMem(mem: string): number {
  const m = /^(\d+(?:\.\d+)?)([mgk])?$/i.exec(mem);
  if (!m) throw new Error(`Invalid memory spec: ${mem}`);
  const n = Number.parseFloat(m[1]!);
  switch (m[2]?.toLowerCase()) {
    case "g": return Math.round(n * 1024 * 1024 * 1024);
    case "m": return Math.round(n * 1024 * 1024);
    case "k": return Math.round(n * 1024);
    default:  return Math.round(n);
  }
}

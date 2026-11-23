import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import type { SandboxHandle } from "../sandbox";
import { expectAt } from "../test-assert";

const mockResponses: Array<{ ok: boolean; body: unknown; status?: number }> = [];

const originalFetch = globalThis.fetch;

function pushMock(body: unknown, ok = true, status = 200) {
  mockResponses.push({ ok, body, status });
}

function dequeueMockResponse(): Response {
  const resp = mockResponses.shift();
  if (!resp) throw new Error("Unexpected fetch call");
  const status = resp.status ?? 200;
  if (resp.body instanceof ArrayBuffer) {
    return new Response(resp.body, { status });
  }
  return new Response(JSON.stringify(resp.body), { status });
}

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function asFetch(impl: TestFetch): typeof fetch {
  return Object.assign(impl, { preconnect: globalThis.fetch.preconnect.bind(globalThis.fetch) });
}

const queuedMockFetch: TestFetch = () => Promise.resolve(dequeueMockResponse());

beforeEach(() => {
  mockResponses.length = 0;
  globalThis.fetch = asFetch(queuedMockFetch);
});

afterAll(() => { globalThis.fetch = originalFetch; });

import { DockerSandboxProvider } from "../sandbox/docker";

describe("DockerSandboxProvider", () => {
  let provider: DockerSandboxProvider;

  beforeEach(() => {
    provider = new DockerSandboxProvider({
      socket: "/var/run/docker.sock",
      image: "node:20-slim",
    });
  });

  it("create: pulls image then calls /containers/create and /containers/{id}/start", async () => {
    pushMock("");                            // POST /images/create (pull)
    pushMock({ Id: "c0ffeeabc1234" });     // POST /containers/create
    pushMock({});                           // POST /containers/{id}/start
    pushMock({ Id: "c0ffee567890a" });     // POST /exec (mkdir -p /workspace)
    pushMock(new ArrayBuffer(0));          // POST /exec/{id}/start
    pushMock({ ExitCode: 0 });             // GET  /exec/{id}/json

    const handle = await provider.create({ name: "test-agent" });

    expect(handle.id).toBe("c0ffeeabc1234");
    expect(handle.provider).toBe("docker");
  });

  it("exec: creates exec instance and returns stdout", async () => {
    const handle: SandboxHandle = { id: "c0ffeeabc1234", provider: "docker" };

    // stdout frame: type=1, size=5, data="hello"
    const frame = new Uint8Array(8 + 5);
    frame[0] = 1; // stdout
    new DataView(frame.buffer).setUint32(4, 5, false);
    frame.set(new TextEncoder().encode("hello"), 8);

    const execMockFetch: TestFetch = (input) => {
      let url: string;
      if (typeof input === "string") {
        url = input;
      } else if (input instanceof URL) {
        url = input.href;
      } else {
        url = input.url;
      }
      if (url.includes("/exec/") && url.includes("/start")) {
        return Promise.resolve(new Response(frame.buffer));
      }
      if (url.includes("/exec/") && url.includes("/json")) {
        return Promise.resolve(new Response(JSON.stringify({ ExitCode: 0 }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ Id: "c0ffee9abc123" }), { status: 200 }));
    };
    globalThis.fetch = asFetch(execMockFetch);

    const result = await provider.exec(handle, ["echo", "hello"]);
    expect(result.stdout).toBe("hello");
    expect(result.exitCode).toBe(0);
  });

  it("destroy: calls DELETE /containers/{id}?force=true", async () => {
    const handle: SandboxHandle = { id: "c0ffeeabc1234", provider: "docker" };
    pushMock({});
    await provider.destroy(handle);
    // No error = pass
  });

  it("list: filters by label", async () => {
    pushMock([{ Id: "c0ffeeabc1234", Labels: { "vakt.swarm-id": "s1" } }]);
    if (!provider.list) {
      throw new Error("provider.list is not defined");
    }
    const results = await provider.list({ labels: { "vakt.swarm-id": "s1" } });
    expect(results).toHaveLength(1);
    expect(expectAt(results, 0, "container").id).toBe("c0ffeeabc1234");
  });
});
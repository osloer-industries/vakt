/** Bun-only `fetch` option for Unix domain socket transport. */
export interface BunUnixFetchInit extends RequestInit {
  unix?: string;
}

/** Local Docker Engine API base URL (fixed — not user-controlled). */
export const DOCKER_ENGINE_API = "http://127.0.0.1/v1.41";

export function bunFetch(input: string, init: BunUnixFetchInit): Promise<Response> {
  if (!input.startsWith(DOCKER_ENGINE_API)) {
    throw new Error("Refusing fetch: only the local Docker Engine API base URL is allowed");
  }
  return fetch(input, init);
}
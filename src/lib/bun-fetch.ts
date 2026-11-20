/** Bun-only `fetch` option for Unix domain socket transport. */
export interface BunUnixFetchInit extends RequestInit {
  unix?: string;
}

export function bunFetch(input: string, init: BunUnixFetchInit): Promise<Response> {
  return fetch(input, init);
}
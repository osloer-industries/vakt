function assertGitRepoPathSegments(pathname: string): void {
  const path = decodeURIComponent(pathname);
  if (!path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    throw new Error("Unsupported or invalid git URL path");
  }
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error("Unsupported or invalid git URL path");
  }
  for (const seg of segments) {
    if (!/^[\w.-]+$/.test(seg)) {
      throw new Error("Unsupported or invalid git URL path");
    }
  }
}

function assertPathSegments(segments: string[], url: string): void {
  if (segments.length === 0) {
    throw new Error(`Unsupported or invalid git URL: ${url}`);
  }
  for (const seg of segments) {
    if (!/^[\w.-]+$/.test(seg)) {
      throw new Error(`Unsupported or invalid git URL: ${url}`);
    }
  }
}

function assertHttpsGitRemote(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Unsupported or invalid git URL: ${url}`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`Unsupported or invalid git URL: ${url}`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`Unsupported or invalid git URL: ${url}`);
  }
  assertGitRepoPathSegments(parsed.pathname);
}

function assertSshGitRemote(url: string): void {
  const colon = url.indexOf(":", "git@".length);
  if (colon <= "git@".length || colon === url.length - 1) {
    throw new Error(`Unsupported or invalid git URL: ${url}`);
  }
  const host = url.slice("git@".length, colon);
  const repoPath = url.slice(colon + 1);
  if (!/^[\w.-]+$/.test(host) || repoPath.includes("..")) {
    throw new Error(`Unsupported or invalid git URL: ${url}`);
  }
  assertPathSegments(repoPath.split("/").filter(Boolean), url);
}

export function assertGitRemoteUrl(url: string): void {
  if (url.startsWith("https://")) {
    assertHttpsGitRemote(url);
    return;
  }
  if (url.startsWith("git@")) {
    assertSshGitRemote(url);
    return;
  }
  throw new Error(`Unsupported or invalid git URL: ${url}`);
}

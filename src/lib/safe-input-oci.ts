function isOciNameChar(ch: string): boolean {
  const c = ch.codePointAt(0);
  if (c === undefined) return false;
  return (c >= 48 && c <= 57) || (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || ch === "." || ch === "_" || ch === "-";
}

function validateOciChars(value: string, ref: string): void {
  for (const ch of value) {
    if (!isOciNameChar(ch)) {
      throw new Error(`Invalid OCI image reference: ${ref}`);
    }
  }
}

function ociNameWithoutDigest(trimmed: string, ref: string): string {
  const at = trimmed.lastIndexOf("@sha256:");
  if (at < 0) return trimmed;
  const digest = trimmed.slice(at + "@sha256:".length);
  if (!/^[a-f0-9]{64}$/i.test(digest)) {
    throw new Error(`Invalid OCI image reference: ${ref}`);
  }
  return trimmed.slice(0, at);
}

function validateOciSegment(segment: string, isLast: boolean, ref: string): void {
  let name = segment;
  if (isLast && segment.includes(":")) {
    const colon = segment.indexOf(":");
    const tag = segment.slice(colon + 1);
    name = segment.slice(0, colon);
    if (tag.length === 0 || tag.length > 128) {
      throw new Error(`Invalid OCI image reference: ${ref}`);
    }
    validateOciChars(tag, ref);
  } else if (segment.includes(":")) {
    throw new Error(`Invalid OCI image reference: ${ref}`);
  }
  if (name.length === 0) {
    throw new Error(`Invalid OCI image reference: ${ref}`);
  }
  validateOciChars(name, ref);
}

export function assertOciReference(ref: string): void {
  const trimmed = ref.trim();
  if (trimmed.length === 0 || trimmed.length > 512) {
    throw new Error(`Invalid OCI image reference: ${ref}`);
  }
  const namePart = ociNameWithoutDigest(trimmed, ref);
  const segments = namePart.split("/");
  if (segments.length === 0 || segments.some((s) => s.length === 0)) {
    throw new Error(`Invalid OCI image reference: ${ref}`);
  }
  const last = segments.length - 1;
  for (let i = 0; i < segments.length; i++) {
    validateOciSegment(segments[i]!, i === last, ref);
  }
}

export function assertDockerImageRef(image: string): void {
  assertOciReference(image);
}

function rebuildOciChars(s: string): string {
  let out = "";
  for (const ch of s) {
    if (!isOciNameChar(ch)) {
      throw new Error("Invalid OCI image reference");
    }
    out += ch;
  }
  return out;
}

function rebuildOciSegment(segment: string, isLast: boolean): string {
  if (isLast && segment.includes(":")) {
    const colon = segment.indexOf(":");
    const name = segment.slice(0, colon);
    const tag = segment.slice(colon + 1);
    return `${rebuildOciChars(name)}:${rebuildOciChars(tag)}`;
  }
  return rebuildOciChars(segment);
}

/** OCI reference validated and rebuilt for external command arguments (e.g. cosign verify). */
export function validatedOciReference(identifier: string): string {
  const trimmed = identifier.trim();
  assertOciReference(trimmed);

  const namePart = ociNameWithoutDigest(trimmed, trimmed);
  const segments = namePart.split("/");
  const last = segments.length - 1;
  const rebuiltSegments: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    validateOciSegment(seg, i === last, trimmed);
    rebuiltSegments.push(rebuildOciSegment(seg, i === last));
  }
  let rebuilt = rebuiltSegments.join("/");

  const at = trimmed.lastIndexOf("@sha256:");
  if (at >= 0) {
    const digest = trimmed.slice(at + "@sha256:".length);
    if (!/^[a-f0-9]{64}$/i.test(digest)) {
      throw new Error(`Invalid OCI image reference: ${trimmed}`);
    }
    rebuilt += `@sha256:${digest.toLowerCase()}`;
  }

  assertOciReference(rebuilt);
  return rebuilt;
}

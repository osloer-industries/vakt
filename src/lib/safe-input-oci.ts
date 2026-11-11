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

/** OCI reference validated for external command arguments (e.g. cosign verify). */
export function validatedOciReference(identifier: string): string {
  const ref = identifier.trim();
  assertOciReference(ref);
  return ref;
}

/** Test-only helpers — avoid non-null assertions and type casts in unit tests. */

export function expectDefined<T>(value: T | undefined | null, label: string): T {
  if (value === undefined || value === null) {
    throw new Error(`Expected defined value: ${label}`);
  }
  return value;
}

export function expectAt<T>(items: readonly T[], index: number, label = `index ${index}`): T {
  const value = items[index];
  return expectDefined(value, label);
}

export function expectEnv(name: string): string {
  return expectDefined(process.env[name], `process.env[${name}]`);
}
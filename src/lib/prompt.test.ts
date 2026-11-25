import { describe, test, expect } from "bun:test";
import { PassThrough } from "node:stream";
import { promptBoolean, readLineFromStream } from "./prompt";

const noop = () => {};

const lineReader = (value: string | null): (() => Promise<string | null>) => () => Promise.resolve(value);

describe("promptBoolean", () => {
  test("returns true when user enters 'y'", async () => {
    const result = await promptBoolean("Question?", false, lineReader("y"), noop);
    expect(result).toBe(true);
  });

  test("returns true when user enters 'Y'", async () => {
    const result = await promptBoolean("Question?", false, lineReader("Y"), noop);
    expect(result).toBe(true);
  });

  test("returns false when user enters 'n'", async () => {
    const result = await promptBoolean("Question?", false, lineReader("n"), noop);
    expect(result).toBe(false);
  });

  test("returns false when user enters anything other than y", async () => {
    const result = await promptBoolean("Question?", false, lineReader("yes"), noop);
    expect(result).toBe(false);
  });

  test("returns false when user enters empty string", async () => {
    const result = await promptBoolean("Question?", false, lineReader(""), noop);
    expect(result).toBe(false);
  });

  test("returns defaultValue when EOF (null)", async () => {
    const result = await promptBoolean("Question?", false, lineReader(null), noop);
    expect(result).toBe(false);
  });

  test("returns true as defaultValue when EOF and defaultValue=true", async () => {
    const result = await promptBoolean("Question?", true, lineReader(null), noop);
    expect(result).toBe(true);
  });

  test("trims whitespace from input", async () => {
    const result = await promptBoolean("Question?", false, lineReader("  y  "), noop);
    expect(result).toBe(true);
  });
});

describe("readLineFromStream", () => {
  test("reads a line up to newline", async () => {
    const stream = new PassThrough();
    const p = readLineFromStream(stream);
    stream.write("hello\n");
    expect(await p).toBe("hello");
  });

  test("accumulates multi-chunk data before newline", async () => {
    const stream = new PassThrough();
    const p = readLineFromStream(stream);
    stream.write("hel");
    stream.write("lo\n");
    expect(await p).toBe("hello");
  });

  test("returns null on empty EOF", async () => {
    const stream = new PassThrough();
    const p = readLineFromStream(stream);
    stream.end();
    expect(await p).toBeNull();
  });

  test("returns partial data on EOF without newline", async () => {
    const stream = new PassThrough();
    const p = readLineFromStream(stream);
    stream.write("no newline");
    stream.end();
    expect(await p).toBe("no newline");
  });

  test("returns only first line when multiple lines sent", async () => {
    const stream = new PassThrough();
    const p = readLineFromStream(stream);
    stream.write("first\nsecond");
    expect(await p).toBe("first");
  });
});
import { describe, expect, it } from "vitest";
import {
  CanonicalJsonError,
  canonicalJson,
  canonicalObject,
  canonicalTimestamp,
} from "./canonical-json.js";

describe("canonical JSON (H17)", () => {
  it("is independent of key insertion order", () => {
    const a = { b: 1, a: 2, c: { z: 1, y: 2 } };
    const b = { c: { y: 2, z: 1 }, a: 2, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":2,"b":1,"c":{"y":2,"z":1}}');
  });

  it("drops undefined members but keeps array holes as null", () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson([1, undefined, 2])).toBe("[1,null,2]");
  });

  it("normalizes Unicode so the same visible text hashes the same", () => {
    const composed = { note: "é" };
    const decomposed = { note: "e\u0301" };
    expect(canonicalJson(composed)).toBe(canonicalJson(decomposed));
  });

  it("pins timestamps to UTC milliseconds and truncates finer precision", () => {
    expect(canonicalTimestamp("2026-09-06T12:00:00.123456Z")).toBe("2026-09-06T12:00:00.123Z");
    expect(canonicalTimestamp(new Date(1_757_000_000_123))).toBe(canonicalTimestamp(1_757_000_000_123.9));
    expect(canonicalJson({ at: new Date("2026-09-06T12:00:00.500Z") })).toBe('{"at":"2026-09-06T12:00:00.500Z"}');
  });

  it("treats -0 and 0 as one value", () => {
    expect(canonicalJson({ v: -0 })).toBe(canonicalJson({ v: 0 }));
  });

  it("refuses values that would silently become null", () => {
    expect(() => canonicalJson({ v: Number.NaN })).toThrow(CanonicalJsonError);
    expect(() => canonicalJson({ v: Number.POSITIVE_INFINITY })).toThrow(CanonicalJsonError);
    expect(() => canonicalJson({ v: 1n })).toThrow(CanonicalJsonError);
    expect(() => canonicalJson({ v: new Map() })).toThrow(CanonicalJsonError);
  });

  it("round-trips through canonicalObject without changing the hash input", () => {
    const value = { z: [3, 2, 1], a: "x" };
    expect(canonicalJson(canonicalObject(value))).toBe(canonicalJson(value));
  });
});

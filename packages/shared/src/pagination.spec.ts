import { describe, expect, it } from "vitest";
import { PaginationQuery, SEARCH_TERM_MAX } from "./contracts.js";

/**
 * Phase 10 (H10) regression. The controller read `q`, the repo read `search`,
 * and nothing in between complained - patient search was silently a no-op for
 * every clinic. The contract now owns the name and publishes ONE value under
 * both keys, so a future call site cannot pick the wrong one.
 */
describe("PaginationQuery search normalisation (H10)", () => {
  it("exposes a `q` term under both keys", () => {
    const parsed = PaginationQuery.parse({ q: "مریم" });
    expect(parsed.q).toBe("مریم");
    expect(parsed.search).toBe("مریم");
  });

  it("exposes a `search` term under both keys", () => {
    const parsed = PaginationQuery.parse({ search: "09121112233" });
    expect(parsed.q).toBe("09121112233");
    expect(parsed.search).toBe("09121112233");
  });

  it("never lets the two keys disagree", () => {
    const parsed = PaginationQuery.parse({ q: "alpha", search: "beta" });
    expect(parsed.q).toBe(parsed.search);
    expect(parsed.q).toBe("alpha");
  });

  it("trims and drops a blank term instead of matching '%%'", () => {
    expect(PaginationQuery.parse({ q: "  رضا  " }).search).toBe("رضا");
    expect(PaginationQuery.parse({ q: "   " }).search).toBeUndefined();
    expect(PaginationQuery.parse({ q: "" }).search).toBeUndefined();
    expect(PaginationQuery.parse({}).search).toBeUndefined();
  });

  it("keeps the pagination defaults and bounds", () => {
    expect(PaginationQuery.parse({})).toMatchObject({ limit: 20, offset: 0 });
    expect(PaginationQuery.parse({ limit: "50", offset: "10" })).toMatchObject({ limit: 50, offset: 10 });
    expect(PaginationQuery.safeParse({ limit: 0 }).success).toBe(false);
    expect(PaginationQuery.safeParse({ limit: 101 }).success).toBe(false);
    expect(PaginationQuery.safeParse({ offset: -1 }).success).toBe(false);
  });

  it("bounds the term so it cannot become an unbounded LIKE", () => {
    expect(PaginationQuery.safeParse({ q: "x".repeat(SEARCH_TERM_MAX) }).success).toBe(true);
    expect(PaginationQuery.safeParse({ q: "x".repeat(SEARCH_TERM_MAX + 1) }).success).toBe(false);
    expect(PaginationQuery.safeParse({ search: "x".repeat(SEARCH_TERM_MAX + 1) }).success).toBe(false);
  });
});

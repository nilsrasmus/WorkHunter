import { describe, expect, it } from "vitest";
import { isSafeHttpUrl, safeHttpUrl } from "./safeUrl";

describe("isSafeHttpUrl", () => {
  it("accepts http and https", () => {
    expect(isSafeHttpUrl("https://example.com/job")).toBe(true);
    expect(isSafeHttpUrl("http://localhost:3000/x")).toBe(true);
  });

  it("rejects dangerous schemes and junk", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("file:///C:/Windows")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<h1>x</h1>")).toBe(false);
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl("not a url")).toBe(false);
  });
});

describe("safeHttpUrl", () => {
  it("trims and returns safe urls only", () => {
    expect(safeHttpUrl("  https://arbetsformedlingen.se/x  ")).toBe(
      "https://arbetsformedlingen.se/x",
    );
    expect(safeHttpUrl("javascript:void(0)")).toBeNull();
  });
});

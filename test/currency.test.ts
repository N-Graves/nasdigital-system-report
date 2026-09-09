import { describe, expect, it } from "vitest";
import { assessCurrency, estimateCurrentMajor, type ReleaseAnchor } from "../src/currency.js";
import type { UaGuess } from "../src/ua.js";

const CHROME: ReleaseAnchor = {
  browser: "chrome",
  version: 140,
  on: "2026-09-01",
  releaseDays: 28,
  maxExtrapolationDays: 540,
};

const guess = (over: Partial<UaGuess> = {}): UaGuess => ({
  browser: "chrome",
  major: 140,
  engine: "blink",
  os: "Windows",
  osVersion: "10 or 11",
  mobile: false,
  iosWebkitForced: false,
  ...over,
});

const at = (iso: string): Date => new Date(iso);

describe("estimateCurrentMajor", () => {
  it("walks forward one major per release cycle", () => {
    expect(estimateCurrentMajor(CHROME, at("2026-09-01"))).toBe(140);
    expect(estimateCurrentMajor(CHROME, at("2026-09-28"))).toBe(140);
    expect(estimateCurrentMajor(CHROME, at("2026-09-29"))).toBe(141);
    expect(estimateCurrentMajor(CHROME, at("2026-12-31"))).toBe(144);
  });

  // The claim has to expire, or in two years it confidently predicts Chrome 260.
  it("gives up once the anchor is too old to extrapolate from", () => {
    expect(estimateCurrentMajor(CHROME, at("2028-06-01"))).toBeNull();
  });

  it("does not go backwards for a clock set in the past", () => {
    expect(estimateCurrentMajor(CHROME, at("2026-01-01"))).toBe(140);
  });
});

describe("assessCurrency", () => {
  // The single most important rule. A version above the estimate means our
  // anchor is stale, not that the visitor is from the future.
  it("never flags a browser that is ahead of the estimate", () => {
    const r = assessCurrency(guess({ major: 145 }), at("2026-09-09"), [CHROME]);
    expect(r.verdict).toBe("current");
  });

  it("says nothing about a browser that is current", () => {
    expect(assessCurrency(guess({ major: 140 }), at("2026-09-09"), [CHROME]).verdict).toBe("current");
  });

  // Being one behind is normal - updates roll out over days.
  it("does not nag about being one version behind", () => {
    expect(assessCurrency(guess({ major: 140 }), at("2026-10-05"), [CHROME]).verdict).toBe("current");
  });

  it("mentions it gently at two or three behind", () => {
    const r = assessCurrency(guess({ major: 140 }), at("2026-11-05"), [CHROME]);
    expect(r.verdict).toBe("a-little-behind");
    expect(r.majorsBehind).toBe(2);
  });

  it("says so plainly once it is four or more behind", () => {
    const r = assessCurrency(guess({ major: 140 }), at("2027-01-20"), [CHROME]);
    expect(r.verdict).toBe("out-of-date");
    expect(r.majorsBehind).toBeGreaterThanOrEqual(4);
    expect(r.message).toMatch(/security/i);
  });

  it("admits it cannot tell rather than extrapolating wildly", () => {
    expect(assessCurrency(guess({ major: 140 }), at("2028-06-01"), [CHROME]).verdict).toBe("cannot-tell");
  });

  it.each([
    ["no guess at all", null],
    ["a browser with no version", guess({ major: null })],
    ["a browser with no anchor", guess({ browser: "other" })],
  ])("cannot tell from %s", (_label, g) => {
    expect(assessCurrency(g, at("2026-09-09"), [CHROME]).verdict).toBe("cannot-tell");
  });

  // "Update your Chrome" on an iPhone is meaningless - the engine is Apple's.
  it("explains that iOS decides the engine, not the browser badge", () => {
    const r = assessCurrency(
      guess({ major: 122, iosWebkitForced: true }),
      at("2027-06-01"),
      [{ ...CHROME, maxExtrapolationDays: 900 }],
    );
    expect(r.verdict).toBe("out-of-date");
    expect(r.message).toMatch(/iPhone|iPad|iOS/);
  });

  // "Update your browser" on an old Mac can mean "buy a new computer".
  it("says Safari updates with the operating system", () => {
    const safari: ReleaseAnchor = {
      browser: "safari",
      version: 26,
      on: "2026-09-15",
      releaseDays: 365,
      maxExtrapolationDays: 3000,
    };
    const r = assessCurrency(guess({ browser: "safari", major: 15 }), at("2031-01-01"), [safari]);
    expect(r.verdict).toBe("out-of-date");
    expect(r.message).toMatch(/macOS|iOS/);
  });
});

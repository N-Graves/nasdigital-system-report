/**
 * Is this browser out of date?
 *
 * Deliberately estimated from a release cadence rather than read from a
 * hardcoded table of current versions. A table baked into a committed bundle on
 * a site that gets rebuilt when someone feels like it is wrong within a month
 * and confidently wrong within three - and the failure is asymmetric. Telling
 * somebody with a fully updated browser that it is out of date is far worse
 * than saying nothing, because it is unactionable, it is provably wrong to
 * them, and it discredits every other number on the page.
 *
 * Four rules keep it honest, and each one is a test:
 *   - never flag "ahead". A version above the estimate means our anchor is
 *     stale, not their browser.
 *   - a generous threshold. Being one or two majors behind is not news.
 *   - the claim expires. Past the extrapolation window it says so rather than
 *     confidently predicting Chrome 260.
 *   - Safari and iOS get different wording, because "update your browser" there
 *     means "update the operating system", and sometimes "buy a new computer".
 */

import type { BrowserId, UaGuess } from "./ua.js";

export interface ReleaseAnchor {
  browser: BrowserId;
  version: number;
  /** ISO date the anchor version shipped. */
  on: string;
  releaseDays: number;
  maxExtrapolationDays: number;
}

export type Verdict = "current" | "a-little-behind" | "out-of-date" | "cannot-tell";

export interface CurrencyResult {
  verdict: Verdict;
  majorsBehind: number | null;
  message: string;
}

/**
 * Anchors, checked against release history when written. Each says "version N
 * shipped on this date"; the estimate walks forward from there. Being a little
 * stale is harmless by design - see maxExtrapolationDays.
 */
export const ANCHORS: ReleaseAnchor[] = [
  // Checked against the vendors' own release feeds when written, not recalled.
  { browser: "chrome", version: 154, on: "2026-09-09", releaseDays: 28, maxExtrapolationDays: 540 },
  // Edge tracks the Chromium milestone closely enough to share the anchor.
  { browser: "edge", version: 154, on: "2026-09-09", releaseDays: 28, maxExtrapolationDays: 540 },
  { browser: "firefox", version: 155, on: "2026-09-09", releaseDays: 28, maxExtrapolationDays: 540 },
  // Safari's number is the OS year and Apple ships roughly one a September.
  { browser: "safari", version: 26, on: "2025-09-15", releaseDays: 365, maxExtrapolationDays: 1100 },
  // Opera and Samsung Internet are deliberately absent. Both keep their own
  // numbering on their own cadence, and no reliable figure for either was
  // verified when this was written. They get "cannot tell", which is the honest
  // answer - a wrong version verdict is worse than no verdict, because it is
  // unactionable and it discredits every other number on the page.
];

const DAY = 86_400_000;

const daysBetween = (from: string, to: Date): number => {
  const start = Date.parse(from);
  if (!Number.isFinite(start)) return Number.NaN;
  return (to.getTime() - start) / DAY;
};

export const estimateCurrentMajor = (anchor: ReleaseAnchor, now: Date): number | null => {
  const elapsed = daysBetween(anchor.on, now);
  if (!Number.isFinite(elapsed)) return null;
  if (elapsed > anchor.maxExtrapolationDays) return null;
  if (elapsed < 0) return anchor.version;
  return anchor.version + Math.floor(elapsed / anchor.releaseDays);
};

/** Behind by this many majors before it is worth saying anything at all. */
const NUDGE_AT = 2;
const WARN_AT = 4;

export const assessCurrency = (
  guess: UaGuess | null,
  now: Date,
  anchors: ReleaseAnchor[] = ANCHORS,
): CurrencyResult => {
  const unknown: CurrencyResult = {
    verdict: "cannot-tell",
    majorsBehind: null,
    message: "Could not work out which browser this is, so nothing is claimed about its age.",
  };
  if (!guess || guess.major === null) return unknown;

  const anchor = anchors.find((a) => a.browser === guess.browser);
  if (!anchor) return unknown;

  const expected = estimateCurrentMajor(anchor, now);
  if (expected === null) {
    return {
      verdict: "cannot-tell",
      majorsBehind: null,
      message:
        "This tool's release-date reference is too old to judge browser versions now. Check for updates the usual way.",
    };
  }

  const behind = expected - guess.major;

  // Ahead of the estimate means the anchor is stale, not the browser.
  if (behind < NUDGE_AT) {
    return { verdict: "current", majorsBehind: Math.max(0, behind), message: "This looks up to date." };
  }

  const tail = guess.iosWebkitForced
    ? " On an iPhone or iPad every browser uses Apple's engine, so this is really about the iOS version."
    : guess.browser === "safari"
      ? " Safari updates with macOS or iOS rather than on its own."
      : "";

  if (behind >= WARN_AT) {
    return {
      verdict: "out-of-date",
      majorsBehind: behind,
      message: `This looks around ${behind} versions behind. Updating is one of the simplest security fixes there is.${tail}`,
    };
  }
  return {
    verdict: "a-little-behind",
    majorsBehind: behind,
    message: `This looks about ${behind} versions behind - not urgent, but worth updating when convenient.${tail}`,
  };
};

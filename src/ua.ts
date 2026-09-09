/**
 * Working out which browser this is.
 *
 * Order of checks is the whole game here. Every Chromium browser's user-agent
 * string contains "Chrome", Chrome's own contains "Safari", and Safari's
 * contains a WebKit build number that looks exactly like a version number and
 * is not one. A parser that reads the string in the obvious order gets all
 * three wrong and looks right doing it.
 */

export type BrowserId =
  | "edge"
  | "opera"
  | "samsung"
  | "chrome"
  | "firefox"
  | "safari"
  | "other";

export interface UaGuess {
  browser: BrowserId;
  major: number | null;
  engine: "blink" | "gecko" | "webkit" | "unknown";
  os: string | null;
  osVersion: string | null;
  mobile: boolean;
  /** iOS forces every browser onto WebKit, so "update Chrome" is meaningless there. */
  iosWebkitForced: boolean;
}

const majorFrom = (ua: string, token: string): number | null => {
  const match = new RegExp(`${token}[/ ](\\d+)`).exec(ua);
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
};

const readOs = (ua: string): { os: string | null; osVersion: string | null; mobile: boolean } => {
  let match = /Windows NT (\d+\.\d+)/.exec(ua);
  if (match?.[1]) {
    // Windows 11 reports 10.0 as well; the UA genuinely cannot tell them apart.
    const map: Record<string, string> = { "10.0": "10 or 11", "6.3": "8.1", "6.2": "8", "6.1": "7" };
    return { os: "Windows", osVersion: map[match[1]] ?? match[1], mobile: false };
  }
  match = /(?:iPhone|CPU) OS (\d+)[._](\d+)/.exec(ua);
  if (match) return { os: "iOS", osVersion: `${match[1]}.${match[2]}`, mobile: true };
  if (/iPad|iPhone|iPod/.test(ua)) return { os: "iOS", osVersion: null, mobile: true };
  match = /Android (\d+(?:\.\d+)?)/.exec(ua);
  if (match?.[1]) return { os: "Android", osVersion: match[1], mobile: true };
  match = /Mac OS X (\d+)[._](\d+)/.exec(ua);
  if (match) return { os: "macOS", osVersion: `${match[1]}.${match[2]}`, mobile: false };
  if (/CrOS/.test(ua)) return { os: "ChromeOS", osVersion: null, mobile: false };
  if (/Linux/.test(ua)) return { os: "Linux", osVersion: null, mobile: false };
  return { os: null, osVersion: null, mobile: false };
};

export const parseUserAgent = (ua: string): UaGuess | null => {
  if (typeof ua !== "string" || ua.trim() === "") return null;
  const { os, osVersion, mobile } = readOs(ua);
  const base = { os, osVersion, mobile, iosWebkitForced: false };

  // On iOS every engine is WebKit, whatever the badge on the app says.
  if (/CriOS\//.test(ua)) {
    return { ...base, browser: "chrome", major: majorFrom(ua, "CriOS"), engine: "webkit", iosWebkitForced: true };
  }
  if (/FxiOS\//.test(ua)) {
    return { ...base, browser: "firefox", major: majorFrom(ua, "FxiOS"), engine: "webkit", iosWebkitForced: true };
  }
  if (/EdgiOS\//.test(ua)) {
    return { ...base, browser: "edge", major: majorFrom(ua, "EdgiOS"), engine: "webkit", iosWebkitForced: true };
  }

  // Every one of these also says "Chrome", so they have to be asked first.
  if (/Edg[A-Z]?\//.test(ua)) {
    return { ...base, browser: "edge", major: majorFrom(ua, "Edg"), engine: "blink" };
  }
  if (/OPR\//.test(ua)) {
    return { ...base, browser: "opera", major: majorFrom(ua, "OPR"), engine: "blink" };
  }
  if (/SamsungBrowser\//.test(ua)) {
    return { ...base, browser: "samsung", major: majorFrom(ua, "SamsungBrowser"), engine: "blink" };
  }
  if (/Firefox\//.test(ua)) {
    return { ...base, browser: "firefox", major: majorFrom(ua, "Firefox"), engine: "gecko" };
  }
  // Chrome's own string ends "... Safari/537.36", so it must beat the Safari check.
  if (/Chrome\//.test(ua)) {
    return { ...base, browser: "chrome", major: majorFrom(ua, "Chrome"), engine: "blink" };
  }
  if (/Safari\//.test(ua)) {
    // Safari's real version is in Version/, never in Safari/605.1.15 - that is a
    // WebKit build number, and reading it gives a plausible, wrong answer.
    return { ...base, browser: "safari", major: majorFrom(ua, "Version"), engine: "webkit" };
  }
  return { ...base, browser: "other", major: null, engine: "unknown" };
};

export interface Brand {
  brand: string;
  version: string;
}

const GREASE = /not[\W_]*a[\W_]*brand/i;

const RANK: BrowserId[] = ["edge", "opera", "samsung", "chrome", "firefox"];

const BRAND_IDS: ReadonlyArray<readonly [RegExp, BrowserId]> = [
  [/microsoft edge/i, "edge"],
  [/opera/i, "opera"],
  [/samsung/i, "samsung"],
  [/google chrome/i, "chrome"],
  [/chromium/i, "chrome"],
  [/firefox/i, "firefox"],
];

/**
 * Chromium injects randomised fake brands into navigator.userAgentData.brands
 * on purpose - "Not)A;Brand", "Not_A Brand", " Not A;Brand", varying per build -
 * so that nobody hardcodes a list. Taking brands[0] shows a visitor
 * "Not)A;Brand 99".
 */
export const pickBrand = (brands: readonly Brand[]): { browser: BrowserId; major: number } | null => {
  const real = brands.filter((b) => !GREASE.test(b.brand));
  let best: { browser: BrowserId; major: number } | null = null;

  for (const entry of real) {
    const matched = BRAND_IDS.find(([pattern]) => pattern.test(entry.brand))?.[1];
    if (!matched) continue;
    const major = Number.parseInt(entry.version, 10);
    if (!Number.isFinite(major)) continue;
    if (!best || RANK.indexOf(matched) < RANK.indexOf(best.browser)) {
      best = { browser: matched, major };
    }
  }
  return best;
};

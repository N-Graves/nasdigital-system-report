import { describe, expect, it } from "vitest";
import { parseUserAgent, pickBrand } from "../src/ua.js";

const UA = {
  chromeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  edge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86",
  opera:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.5322.77",
  samsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0.6261.89 Mobile/15E148 Safari/604.1",
  firefoxIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/605.1.15",
  firefoxWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  bot: "Mozilla/5.0 (compatible; SomeBot/1.0; +http://example.com/bot)",
};

describe("parseUserAgent picks the right browser out of a string that names several", () => {
  // Every one of these contains "Chrome", and Chrome's own contains "Safari".
  // A parser that reads them in the obvious order gets all of them wrong.
  it("reads Edge as Edge, not Chrome", () => {
    const g = parseUserAgent(UA.edge);
    expect(g?.browser).toBe("edge");
    expect(g?.major).toBe(131);
  });

  it("reads Opera as Opera, not Chrome", () => {
    expect(parseUserAgent(UA.opera)?.browser).toBe("opera");
    expect(parseUserAgent(UA.opera)?.major).toBe(115);
  });

  it("reads Samsung Internet as itself, not Chrome", () => {
    expect(parseUserAgent(UA.samsung)?.browser).toBe("samsung");
    expect(parseUserAgent(UA.samsung)?.major).toBe(26);
  });

  it("reads Chrome as Chrome, not Safari", () => {
    const g = parseUserAgent(UA.chromeWin);
    expect(g?.browser).toBe("chrome");
    expect(g?.major).toBe(131);
    expect(g?.engine).toBe("blink");
  });

  // Safari/605.1.15 is a WebKit build number. Reading it as the version gives a
  // plausible number that is completely wrong, which is why it looks fine.
  it("takes Safari's version from Version/, never from Safari/", () => {
    const g = parseUserAgent(UA.safariMac);
    expect(g?.browser).toBe("safari");
    expect(g?.major).toBe(17);
    expect(g?.major).not.toBe(605);
  });

  it("reads Firefox", () => {
    const g = parseUserAgent(UA.firefoxWin);
    expect(g?.browser).toBe("firefox");
    expect(g?.major).toBe(126);
    expect(g?.engine).toBe("gecko");
  });
});

describe("parseUserAgent knows iOS forces every engine to WebKit", () => {
  it.each([
    ["chrome", UA.chromeIos, 122],
    ["firefox", UA.firefoxIos, 124],
  ])("marks %s on iOS as WebKit-forced", (browser, ua, major) => {
    const g = parseUserAgent(ua);
    expect(g?.browser).toBe(browser);
    expect(g?.major).toBe(major);
    expect(g?.engine).toBe("webkit");
    expect(g?.iosWebkitForced).toBe(true);
  });

  it("does not mark desktop Chrome as WebKit-forced", () => {
    expect(parseUserAgent(UA.chromeWin)?.iosWebkitForced).toBe(false);
  });
});

describe("parseUserAgent on the operating system", () => {
  it.each([
    [UA.chromeWin, "Windows", "10 or 11", false],
    [UA.safariMac, "macOS", "10.15", false],
    [UA.samsung, "Android", "14", true],
    [UA.chromeIos, "iOS", "17.4", true],
  ])("reads the OS", (ua, os, version, mobile) => {
    const g = parseUserAgent(ua);
    expect(g?.os).toBe(os);
    expect(g?.osVersion).toBe(version);
    expect(g?.mobile).toBe(mobile);
  });
});

describe("parseUserAgent on things it cannot read", () => {
  it("returns other rather than guessing at a bot", () => {
    const g = parseUserAgent(UA.bot);
    expect(g?.browser).toBe("other");
    expect(g?.major).toBeNull();
  });

  it.each(["", "   "])("returns null for an empty string", (ua) => {
    expect(parseUserAgent(ua)).toBeNull();
  });

  it("returns null rather than throwing on a non-string", () => {
    expect(parseUserAgent(null as unknown as string)).toBeNull();
  });
});

describe("pickBrand skips the fake brands Chromium injects", () => {
  // These are randomised per build on purpose - the punctuation and spacing
  // vary - so taking brands[0] shows the visitor "Not)A;Brand 99".
  it.each([["Not)A;Brand"], ["Not_A Brand"], [" Not A;Brand"], ["Not.A/Brand"]])(
    "ignores the GREASE entry %s",
    (fake) => {
      const picked = pickBrand([
        { brand: fake, version: "99" },
        { brand: "Google Chrome", version: "131" },
        { brand: "Chromium", version: "131" },
      ]);
      expect(picked).toEqual({ browser: "chrome", major: 131 });
    },
  );

  it("prefers the most specific brand when several are real", () => {
    const picked = pickBrand([
      { brand: "Chromium", version: "131" },
      { brand: "Microsoft Edge", version: "131" },
      { brand: "Not)A;Brand", version: "99" },
    ]);
    expect(picked?.browser).toBe("edge");
  });

  it("returns null when nothing real is left", () => {
    expect(pickBrand([{ brand: "Not)A;Brand", version: "99" }])).toBeNull();
    expect(pickBrand([])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  buildReport,
  describeConnection,
  describeDisplay,
  describeGpu,
  describeMemory,
  formatReport,
  type RawFacts,
} from "../src/report.js";

const NOW = new Date("2026-09-09T20:00:00Z");

const facts = (over: Partial<RawFacts> = {}): RawFacts => ({
  ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  uaData: null,
  gl: { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  gpuAdapter: null,
  hardwareConcurrency: 20,
  deviceMemoryGb: 8,
  connection: { effectiveType: "4g", downlink: 10, rtt: 50 },
  screen: { width: 2560, height: 1440, colorDepth: 24 },
  devicePixelRatio: 1,
  maxTouchPoints: 0,
  locale: { locale: "en-GB", timeZone: "Europe/London" },
  capturedAt: "2026-09-09T20:00:00Z",
  ...over,
});

describe("describeGpu", () => {
  it.each([
    [
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "NVIDIA",
      "NVIDIA GeForce RTX 3070",
    ],
    [
      "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "Intel",
      "Intel UHD Graphics 620",
    ],
  ])("pulls the model out of an ANGLE string", (renderer, vendor, model) => {
    const gpu = describeGpu({ vendor: "Google Inc.", renderer }, null);
    expect(gpu?.vendor).toBe(vendor);
    expect(gpu?.model).toBe(model);
    expect(gpu?.redacted).toBe(false);
  });

  // Firefox with resistFingerprinting returns this literally. Rendered as-is,
  // the tool tells someone their graphics card is "Mozilla".
  it("treats Mozilla/Mozilla as redacted rather than a card called Mozilla", () => {
    const gpu = describeGpu({ vendor: "Mozilla", renderer: "Mozilla" }, null);
    expect(gpu?.redacted).toBe(true);
    expect(gpu?.model).toBeNull();
  });

  it("falls back to the WebGPU adapter when WebGL says nothing", () => {
    const gpu = describeGpu(null, { vendor: "apple", architecture: "m-series", description: "" });
    expect(gpu?.redacted).toBe(false);
    expect(gpu?.model).toContain("apple");
  });

  it("returns null when there is nothing at all", () => {
    expect(describeGpu(null, null)).toBeNull();
  });

  it("keeps a plain renderer string that is not ANGLE", () => {
    expect(describeGpu({ vendor: "Apple", renderer: "Apple M2 Pro" }, null)?.model).toBe("Apple M2 Pro");
  });
});

describe("describeMemory", () => {
  // deviceMemory is capped at 8 and rounded to a power of two, so a 64 GB
  // workstation reports 8. "8 GB" flat is wrong and its owner will say so.
  it("says at least rather than exactly at the cap", () => {
    expect(describeMemory(8)).toMatch(/or more/);
  });

  it("is plain below the cap", () => {
    expect(describeMemory(4)).toBe("about 4 GB");
  });

  it("returns null when the browser does not expose it", () => {
    expect(describeMemory(null)).toBeNull();
  });
});

describe("describeDisplay and describeConnection", () => {
  it("mentions scaling only when there is any", () => {
    expect(describeDisplay({ width: 2560, height: 1440, colorDepth: 24 }, 1)).toBe("2560 x 1440");
    expect(describeDisplay({ width: 1512, height: 982, colorDepth: 30 }, 2)).toMatch(/2x scaling/);
  });

  it("returns null rather than an empty string when there is no connection info", () => {
    expect(describeConnection(null)).toBeNull();
    expect(describeConnection({})).toBeNull();
  });
});

describe("buildReport", () => {
  it("never leaves a value blank", () => {
    const report = buildReport(facts(), NOW);
    for (const section of report.sections) {
      for (const r of section.rows) {
        expect(r.value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  // The report a locked-down browser produces is the one most likely to ship
  // broken, because it is not the one anyone develops against.
  it("still produces a complete report when almost everything is hidden", () => {
    const report = buildReport(
      facts({
        gl: null,
        gpuAdapter: null,
        hardwareConcurrency: null,
        deviceMemoryGb: null,
        connection: null,
        screen: null,
        devicePixelRatio: null,
        maxTouchPoints: null,
        locale: null,
      }),
      NOW,
    );
    const values = report.sections.flatMap((s) => s.rows.map((r) => r.value));
    expect(values.every((v) => v.trim().length > 0)).toBe(true);
    expect(values.some((v) => v.includes("not available"))).toBe(true);
    expect(values.join(" ")).not.toMatch(/undefined|null|NaN|\[object/);
  });

  it("prefers userAgentData over the frozen user-agent string", () => {
    const report = buildReport(
      facts({
        uaData: {
          brands: [
            { brand: "Not)A;Brand", version: "99" },
            { brand: "Microsoft Edge", version: "141" },
          ],
          platform: "Windows",
        },
      }),
      NOW,
    );
    expect(report.guess?.browser).toBe("edge");
    expect(report.guess?.major).toBe(141);
  });

  it("marks how much each value is worth", () => {
    const report = buildReport(facts(), NOW);
    const all = report.sections.flatMap((s) => s.rows);
    expect(all.find((r) => r.label === "Memory")?.confidence).toBe("reported");
    expect(all.find((r) => r.label === "Time zone")?.confidence).toBe("read");
  });
});

describe("formatReport", () => {
  it("produces plain text with no leftover placeholders", () => {
    const text = formatReport(buildReport(facts(), NOW), "9 September 2026");
    expect(text).toContain("System report");
    expect(text).toContain("NVIDIA GeForce RTX 3070");
    expect(text).not.toMatch(/undefined|\[object Object\]/);
    expect(text.split("\n").length).toBeGreaterThan(10);
  });

  it("says plainly that nothing was uploaded", () => {
    const text = formatReport(buildReport(facts(), NOW), "9 September 2026");
    expect(text).toMatch(/nothing was uploaded/i);
  });
});

describe("a screen that is not a screen", () => {
  // Headless and non-compositing browsers report 0 x 0. Passing that through to
  // a technician is worse than saying the browser would not tell us.
  it.each([
    [0, 0],
    [1920, 0],
    [0, 1080],
  ])("treats %i x %i as unavailable", (width, height) => {
    expect(describeDisplay({ width, height, colorDepth: 24 }, 1)).toBeNull();
  });

  it("still reports a real screen", () => {
    expect(describeDisplay({ width: 1920, height: 1080, colorDepth: 24 }, 1)).toBe("1920 x 1080");
  });
});

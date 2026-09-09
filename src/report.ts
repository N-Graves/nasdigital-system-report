/**
 * Turning the raw facts into rows a person, or a repair technician, can read.
 *
 * Every row carries how much its value is worth: "read" means the browser told
 * us plainly, "reported" means the browser told us something it is allowed to
 * round or fudge, "guessed" means we worked it out. That field costs nothing
 * and is the difference between a report and a list of numbers of unknown
 * provenance - which matters, because somebody is going to drive to a house
 * based on it.
 */

import { assessCurrency, type CurrencyResult } from "./currency.js";
import { pickBrand, parseUserAgent, type UaGuess } from "./ua.js";

export interface RawFacts {
  ua: string | null;
  uaData: { brands: { brand: string; version: string }[]; platform: string | null } | null;
  gl: { vendor: string | null; renderer: string | null } | null;
  gpuAdapter: { vendor: string; architecture: string; description: string } | null;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  connection: { effectiveType?: string; downlink?: number; rtt?: number } | null;
  screen: { width: number; height: number; colorDepth: number } | null;
  devicePixelRatio: number | null;
  maxTouchPoints: number | null;
  locale: { locale: string; timeZone: string } | null;
  capturedAt: string;
}

export type Confidence = "read" | "reported" | "guessed";

export interface ReportRow {
  label: string;
  value: string;
  confidence: Confidence;
  note?: string;
}

export interface ReportSection {
  title: string;
  rows: ReportRow[];
}

const UNAVAILABLE = "not available in this browser";

/** Firefox with resistFingerprinting returns the literal string "Mozilla" for both. */
const REDACTED = /^(mozilla|unknown)$/i;

export interface GpuSummary {
  vendor: string | null;
  model: string | null;
  redacted: boolean;
}

export const describeGpu = (
  gl: RawFacts["gl"],
  adapter: RawFacts["gpuAdapter"],
): GpuSummary | null => {
  const renderer = gl?.renderer?.trim() ?? "";
  const vendor = gl?.vendor?.trim() ?? "";

  if (renderer && !REDACTED.test(renderer)) {
    // Chrome reports through ANGLE: "ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0, D3D11)"
    const angle = /^ANGLE \(([^,]+),\s*(.+?)(?:\s+(?:Direct3D|D3D|OpenGL|Vulkan)[^,]*)?(?:,\s*([^)]+))?\)$/.exec(renderer);
    if (angle) {
      return {
        vendor: angle[1]?.trim() ?? null,
        model: (angle[2] ?? "").replace(/\(R\)|\(TM\)/g, "").trim() || null,
        redacted: false,
      };
    }
    return {
      vendor: vendor && !REDACTED.test(vendor) ? vendor : null,
      model: renderer.replace(/\(R\)|\(TM\)/g, "").trim(),
      redacted: false,
    };
  }

  if (adapter) {
    const model = [adapter.vendor, adapter.architecture].filter(Boolean).join(" ").trim();
    return { vendor: adapter.vendor || null, model: model || null, redacted: false };
  }
  if (renderer || vendor) return { vendor: null, model: null, redacted: true };
  return null;
};

export const describeMemory = (gb: number | null): string | null => {
  if (gb === null || !Number.isFinite(gb)) return null;
  // navigator.deviceMemory is capped at 8 and rounded to a power of two, so a
  // 64 GB workstation reports 8. Saying "8 GB" flatly is wrong.
  return gb >= 8 ? "8 GB or more" : `about ${gb} GB`;
};

export const describeConnection = (c: RawFacts["connection"]): string | null => {
  if (!c) return null;
  const parts: string[] = [];
  if (c.effectiveType) parts.push(`roughly ${c.effectiveType}`);
  if (typeof c.downlink === "number") parts.push(`${c.downlink} Mbps estimated`);
  if (typeof c.rtt === "number") parts.push(`${c.rtt} ms round trip`);
  return parts.length > 0 ? parts.join(", ") : null;
};

export const describeDisplay = (
  screen: RawFacts["screen"],
  dpr: number | null,
): string | null => {
  // No real browser reports a zero-sized screen, but a headless or
  // non-compositing one does, and "0 x 0" in a report a technician reads is
  // worse than admitting the browser would not say.
  if (!screen || screen.width <= 0 || screen.height <= 0) return null;
  const base = `${screen.width} x ${screen.height}`;
  if (!dpr || dpr === 1) return base;
  return `${base} at ${dpr}x scaling (${Math.round(screen.width * dpr)} x ${Math.round(screen.height * dpr)} real pixels)`;
};

const row = (label: string, value: string | null, confidence: Confidence, note?: string): ReportRow =>
  note === undefined
    ? { label, value: value ?? UNAVAILABLE, confidence: value === null ? "read" : confidence }
    : { label, value: value ?? UNAVAILABLE, confidence: value === null ? "read" : confidence, note };

export interface Report {
  sections: ReportSection[];
  currency: CurrencyResult;
  guess: UaGuess | null;
}

export const buildReport = (facts: RawFacts, now: Date): Report => {
  const guess = facts.ua ? parseUserAgent(facts.ua) : null;
  const branded = facts.uaData ? pickBrand(facts.uaData.brands) : null;

  // userAgentData is the better source on Chromium, because UA reduction has
  // frozen the version in the string itself.
  const merged: UaGuess | null = guess
    ? branded
      ? { ...guess, browser: branded.browser, major: branded.major }
      : guess
    : null;

  const currency = assessCurrency(merged, now);
  const gpu = describeGpu(facts.gl, facts.gpuAdapter);

  const browserValue = merged
    ? `${merged.browser === "other" ? "unrecognised" : merged.browser}${merged.major ? ` ${merged.major}` : ""}`
    : null;

  const sections: ReportSection[] = [
    {
      title: "Graphics",
      rows: [
        row(
          "Graphics card",
          gpu?.redacted ? null : (gpu?.model ?? null),
          "read",
          gpu?.redacted ? "This browser deliberately hides it for privacy." : undefined,
        ),
        row("Graphics vendor", gpu?.redacted ? null : (gpu?.vendor ?? null), "read"),
      ],
    },
    {
      title: "Processor and memory",
      rows: [
        row(
          "Processor threads",
          facts.hardwareConcurrency ? String(facts.hardwareConcurrency) : null,
          "reported",
          "Logical cores, and some browsers under-report this.",
        ),
        row(
          "Memory",
          describeMemory(facts.deviceMemoryGb),
          "reported",
          "Browsers round this and cap it at 8 GB.",
        ),
      ],
    },
    {
      title: "System",
      rows: [
        row("Operating system", merged?.os ? `${merged.os}${merged.osVersion ? ` ${merged.osVersion}` : ""}` : null, "guessed"),
        row("Browser", browserValue, branded ? "read" : "guessed"),
        row("Touch screen", facts.maxTouchPoints === null ? null : facts.maxTouchPoints > 0 ? "yes" : "no", "read"),
      ],
    },
    {
      title: "Display",
      rows: [
        row("Screen", describeDisplay(facts.screen, facts.devicePixelRatio), "read"),
        row("Colour depth", facts.screen ? `${facts.screen.colorDepth}-bit` : null, "read"),
      ],
    },
    {
      title: "Connection and locale",
      rows: [
        row("Connection", describeConnection(facts.connection), "reported"),
        row("Time zone", facts.locale?.timeZone ?? null, "read"),
        row("Language", facts.locale?.locale ?? null, "read"),
      ],
    },
  ];

  return { sections, currency, guess: merged };
};

export const formatReport = (report: Report, capturedAt: string): string => {
  const lines: string[] = ["System report", `Taken ${capturedAt}`, ""];
  for (const section of report.sections) {
    lines.push(`${section.title}:`);
    for (const r of section.rows) lines.push(`  ${r.label}: ${r.value}`);
    lines.push("");
  }
  lines.push(`Browser age: ${report.currency.message}`);
  lines.push("");
  lines.push("Taken with the free system report at nasdigital.co.uk. Nothing was uploaded;");
  lines.push("this text was copied from the page by the person sending it.");
  return lines.join("\n");
};

/**
 * The DOM half: read what the browser will tell us, hand it to the pure
 * modules, render the rows.
 *
 * The WebGL probe is the only part that costs anything. It creates a detached
 * canvas, asks for a low-power context so a laptop with two GPUs does not wake
 * the discrete one, reads two strings, and then explicitly loses the context.
 * Browsers cap how many live WebGL contexts a page may hold, and this bundle
 * drops onto a site alongside other things - one leaked context is one fewer
 * for everybody else on the page.
 */

import { copyText, h, mount } from "@nasdigitaluk/withnate-tool-core";
import { buildReport, formatReport, type RawFacts, type ReportRow } from "./report.js";

type Nav = Navigator & {
  deviceMemory?: number;
  connection?: { effectiveType?: string; downlink?: number; rtt?: number };
  userAgentData?: { brands?: { brand: string; version: string }[]; platform?: string };
  gpu?: { requestAdapter(): Promise<{ info?: Record<string, string> } | null> };
};

const probeWebgl = (): RawFacts["gl"] => {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", {
      powerPreference: "low-power",
      antialias: false,
      depth: false,
      stencil: false,
      alpha: false,
    }) as WebGLRenderingContext | null;
    if (!gl) return null;

    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const read = (p: number | undefined): string | null => {
      if (p === undefined) return null;
      const value: unknown = gl.getParameter(p);
      return typeof value === "string" && value.trim() !== "" ? value : null;
    };
    const result = {
      vendor: read(info?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR),
      renderer: read(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
    };
    // Dropping the reference relies on garbage collection, which can take a
    // long time. This is the only reliable release.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return result;
  } catch {
    return null;
  }
};

const probeWebgpu = async (nav: Nav): Promise<RawFacts["gpuAdapter"]> => {
  if (!nav.gpu) return null;
  try {
    const adapter = await nav.gpu.requestAdapter();
    const info = adapter?.info;
    if (!info) return null;
    return {
      vendor: info["vendor"] ?? "",
      architecture: info["architecture"] ?? "",
      description: info["description"] ?? "",
    };
  } catch {
    return null;
  }
};

const collect = async (): Promise<RawFacts> => {
  const nav = navigator as Nav;
  let locale: RawFacts["locale"] = null;
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    locale = { locale: resolved.locale, timeZone: resolved.timeZone };
  } catch {
    locale = null;
  }

  return {
    ua: typeof nav.userAgent === "string" ? nav.userAgent : null,
    uaData: nav.userAgentData?.brands
      ? { brands: nav.userAgentData.brands, platform: nav.userAgentData.platform ?? null }
      : null,
    gl: probeWebgl(),
    gpuAdapter: await probeWebgpu(nav),
    hardwareConcurrency: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    deviceMemoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    connection: nav.connection
      ? {
          ...(nav.connection.effectiveType !== undefined && { effectiveType: nav.connection.effectiveType }),
          ...(nav.connection.downlink !== undefined && { downlink: nav.connection.downlink }),
          ...(nav.connection.rtt !== undefined && { rtt: nav.connection.rtt }),
        }
      : null,
    screen: typeof screen !== "undefined"
      ? { width: screen.width, height: screen.height, colorDepth: screen.colorDepth }
      : null,
    devicePixelRatio: typeof devicePixelRatio === "number" ? devicePixelRatio : null,
    maxTouchPoints: typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints : null,
    locale,
    capturedAt: new Date().toISOString(),
  };
};

const rowNode = (r: ReportRow): HTMLElement =>
  h(
    "div",
    { class: "sr-row" },
    h("dt", { class: "sr-label" }, r.label),
    h(
      "dd",
      { class: `sr-value${r.value.startsWith("not available") ? " sr-missing" : ""}` },
      r.value,
      r.note ? h("span", { class: "sr-hint" }, r.note) : null,
    ),
  );

mount("[data-sr]", ({ root }) => {
  const out = root.querySelector<HTMLElement>("[data-sr-report]");
  const verdict = root.querySelector<HTMLElement>("[data-sr-verdict]");
  const status = root.querySelector<HTMLElement>("[data-sr-status]");
  const copyButton = root.querySelector<HTMLButtonElement>("[data-sr-copy]");
  if (!out) return;

  void collect().then((facts) => {
    const now = new Date();
    const report = buildReport(facts, now);
    const taken = now.toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });

    out.textContent = "";
    for (const section of report.sections) {
      out.append(
        h(
          "section",
          { class: "sr-section" },
          h("h3", { class: "sr-section-title" }, section.title),
          h("dl", { class: "sr-list" }, ...section.rows.map(rowNode)),
        ),
      );
    }

    if (verdict) {
      verdict.textContent = report.currency.message;
      verdict.className = `sr-verdict sr-${report.currency.verdict}`;
    }

    copyButton?.addEventListener("click", () => {
      const label = copyButton.textContent ?? "Copy report";
      void copyText(formatReport(report, taken)).then(({ ok }) => {
        if (status) {
          status.textContent = ok
            ? "Report copied. Paste it into your message."
            : "This browser would not let the page copy it. Select the text and copy it yourself.";
        }
        if (!ok) return;
        copyButton.textContent = "Copied";
        window.setTimeout(() => {
          copyButton.textContent = label;
        }, 1600);
      });
    });
  });
});

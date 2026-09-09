/*! nasdigital-system-report v0.1.0 - MIT
 * https://github.com/N-Graves/nasdigital-system-report#readme
 * Runs entirely in the browser. No network requests, no storage.
 */
"use strict";
(() => {
  // node_modules/@nasdigitaluk/withnate-tool-core/dist/sniff.js
  var HEADER_BYTES = 64 * 1024;

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/units.js
  var MM_PER_INCH = 25.4;
  var CM_PER_INCH = MM_PER_INCH / 10;

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/exif.js
  var MAX_BLOCK_BYTES = 4 * 1024 * 1024;
  var TEXT = new TextDecoder("utf-8", { fatal: false });

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/mount.js
  var getWn = () => globalThis.WN ?? null;
  var mount = (selector, init) => {
    const run = () => {
      const root = document.querySelector(selector);
      if (!root)
        return;
      const wn = getWn();
      const reduced = wn?.reduced ?? (typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)").matches : true);
      init({ root, wn, reduced });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/dom.js
  var h = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v === null || v === void 0)
        continue;
      if (k === "class")
        node.className = String(v);
      else if (v === true)
        node.setAttribute(k, "");
      else
        node.setAttribute(k, String(v));
    }
    for (const c of children) {
      if (c === null || c === void 0)
        continue;
      node.append(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/clipboard.js
  var clipboardOf = (doc) => {
    const view = doc.defaultView;
    const nav = view?.navigator ?? (typeof navigator === "undefined" ? void 0 : navigator);
    return nav?.clipboard;
  };
  var selectAndCopy = (text, doc) => {
    if (!doc.body || typeof doc.execCommand !== "function")
      return { ok: false, method: "manual" };
    const previous = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    const field = doc.createElement("textarea");
    field.value = text;
    field.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;";
    field.readOnly = true;
    field.contentEditable = "true";
    doc.body.append(field);
    try {
      field.focus();
      field.select();
      field.setSelectionRange(0, text.length);
      return doc.execCommand("copy") ? { ok: true, method: "exec-command" } : { ok: false, method: "manual" };
    } catch {
      return { ok: false, method: "manual" };
    } finally {
      field.remove();
      previous?.focus();
    }
  };
  var copyText = async (text, doc = document) => {
    const clipboard = clipboardOf(doc);
    if (clipboard && typeof clipboard.writeText === "function") {
      try {
        await clipboard.writeText(text);
        return { ok: true, method: "clipboard" };
      } catch {
      }
    }
    return selectAndCopy(text, doc);
  };

  // src/currency.ts
  var ANCHORS = [
    // Checked against the vendors' own release feeds when written, not recalled.
    { browser: "chrome", version: 154, on: "2026-09-09", releaseDays: 28, maxExtrapolationDays: 540 },
    // Edge tracks the Chromium milestone closely enough to share the anchor.
    { browser: "edge", version: 154, on: "2026-09-09", releaseDays: 28, maxExtrapolationDays: 540 },
    { browser: "firefox", version: 155, on: "2026-09-09", releaseDays: 28, maxExtrapolationDays: 540 },
    // Safari's number is the OS year and Apple ships roughly one a September.
    { browser: "safari", version: 26, on: "2025-09-15", releaseDays: 365, maxExtrapolationDays: 1100 }
    // Opera and Samsung Internet are deliberately absent. Both keep their own
    // numbering on their own cadence, and no reliable figure for either was
    // verified when this was written. They get "cannot tell", which is the honest
    // answer - a wrong version verdict is worse than no verdict, because it is
    // unactionable and it discredits every other number on the page.
  ];
  var DAY = 864e5;
  var daysBetween = (from, to) => {
    const start = Date.parse(from);
    if (!Number.isFinite(start)) return Number.NaN;
    return (to.getTime() - start) / DAY;
  };
  var estimateCurrentMajor = (anchor, now) => {
    const elapsed = daysBetween(anchor.on, now);
    if (!Number.isFinite(elapsed)) return null;
    if (elapsed > anchor.maxExtrapolationDays) return null;
    if (elapsed < 0) return anchor.version;
    return anchor.version + Math.floor(elapsed / anchor.releaseDays);
  };
  var NUDGE_AT = 2;
  var WARN_AT = 4;
  var assessCurrency = (guess, now, anchors = ANCHORS) => {
    const unknown = {
      verdict: "cannot-tell",
      majorsBehind: null,
      message: "Could not work out which browser this is, so nothing is claimed about its age."
    };
    if (!guess || guess.major === null) return unknown;
    const anchor = anchors.find((a) => a.browser === guess.browser);
    if (!anchor) return unknown;
    const expected = estimateCurrentMajor(anchor, now);
    if (expected === null) {
      return {
        verdict: "cannot-tell",
        majorsBehind: null,
        message: "This tool's release-date reference is too old to judge browser versions now. Check for updates the usual way."
      };
    }
    const behind = expected - guess.major;
    if (behind < NUDGE_AT) {
      return { verdict: "current", majorsBehind: Math.max(0, behind), message: "This looks up to date." };
    }
    const tail = guess.iosWebkitForced ? " On an iPhone or iPad every browser uses Apple's engine, so this is really about the iOS version." : guess.browser === "safari" ? " Safari updates with macOS or iOS rather than on its own." : "";
    if (behind >= WARN_AT) {
      return {
        verdict: "out-of-date",
        majorsBehind: behind,
        message: `This looks around ${behind} versions behind. Updating is one of the simplest security fixes there is.${tail}`
      };
    }
    return {
      verdict: "a-little-behind",
      majorsBehind: behind,
      message: `This looks about ${behind} versions behind - not urgent, but worth updating when convenient.${tail}`
    };
  };

  // src/ua.ts
  var majorFrom = (ua, token) => {
    const match = new RegExp(`${token}[/ ](\\d+)`).exec(ua);
    if (!match?.[1]) return null;
    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) ? value : null;
  };
  var readOs = (ua) => {
    let match = /Windows NT (\d+\.\d+)/.exec(ua);
    if (match?.[1]) {
      const map = { "10.0": "10 or 11", "6.3": "8.1", "6.2": "8", "6.1": "7" };
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
  var parseUserAgent = (ua) => {
    if (typeof ua !== "string" || ua.trim() === "") return null;
    const { os, osVersion, mobile } = readOs(ua);
    const base = { os, osVersion, mobile, iosWebkitForced: false };
    if (/CriOS\//.test(ua)) {
      return { ...base, browser: "chrome", major: majorFrom(ua, "CriOS"), engine: "webkit", iosWebkitForced: true };
    }
    if (/FxiOS\//.test(ua)) {
      return { ...base, browser: "firefox", major: majorFrom(ua, "FxiOS"), engine: "webkit", iosWebkitForced: true };
    }
    if (/EdgiOS\//.test(ua)) {
      return { ...base, browser: "edge", major: majorFrom(ua, "EdgiOS"), engine: "webkit", iosWebkitForced: true };
    }
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
    if (/Chrome\//.test(ua)) {
      return { ...base, browser: "chrome", major: majorFrom(ua, "Chrome"), engine: "blink" };
    }
    if (/Safari\//.test(ua)) {
      return { ...base, browser: "safari", major: majorFrom(ua, "Version"), engine: "webkit" };
    }
    return { ...base, browser: "other", major: null, engine: "unknown" };
  };
  var GREASE = /not[\W_]*a[\W_]*brand/i;
  var RANK = ["edge", "opera", "samsung", "chrome", "firefox"];
  var BRAND_IDS = [
    [/microsoft edge/i, "edge"],
    [/opera/i, "opera"],
    [/samsung/i, "samsung"],
    [/google chrome/i, "chrome"],
    [/chromium/i, "chrome"],
    [/firefox/i, "firefox"]
  ];
  var pickBrand = (brands) => {
    const real = brands.filter((b) => !GREASE.test(b.brand));
    let best = null;
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

  // src/report.ts
  var UNAVAILABLE = "not available in this browser";
  var REDACTED = /^(mozilla|unknown)$/i;
  var describeGpu = (gl, adapter) => {
    const renderer = gl?.renderer?.trim() ?? "";
    const vendor = gl?.vendor?.trim() ?? "";
    if (renderer && !REDACTED.test(renderer)) {
      const angle = /^ANGLE \(([^,]+),\s*(.+?)(?:\s+(?:Direct3D|D3D|OpenGL|Vulkan)[^,]*)?(?:,\s*([^)]+))?\)$/.exec(renderer);
      if (angle) {
        return {
          vendor: angle[1]?.trim() ?? null,
          model: (angle[2] ?? "").replace(/\(R\)|\(TM\)/g, "").trim() || null,
          redacted: false
        };
      }
      return {
        vendor: vendor && !REDACTED.test(vendor) ? vendor : null,
        model: renderer.replace(/\(R\)|\(TM\)/g, "").trim(),
        redacted: false
      };
    }
    if (adapter) {
      const model = [adapter.vendor, adapter.architecture].filter(Boolean).join(" ").trim();
      return { vendor: adapter.vendor || null, model: model || null, redacted: false };
    }
    if (renderer || vendor) return { vendor: null, model: null, redacted: true };
    return null;
  };
  var describeMemory = (gb) => {
    if (gb === null || !Number.isFinite(gb)) return null;
    return gb >= 8 ? "8 GB or more" : `about ${gb} GB`;
  };
  var describeConnection = (c) => {
    if (!c) return null;
    const parts = [];
    if (c.effectiveType) parts.push(`roughly ${c.effectiveType}`);
    if (typeof c.downlink === "number") parts.push(`${c.downlink} Mbps estimated`);
    if (typeof c.rtt === "number") parts.push(`${c.rtt} ms round trip`);
    return parts.length > 0 ? parts.join(", ") : null;
  };
  var describeDisplay = (screen2, dpr) => {
    if (!screen2 || screen2.width <= 0 || screen2.height <= 0) return null;
    const base = `${screen2.width} x ${screen2.height}`;
    if (!dpr || dpr === 1) return base;
    return `${base} at ${dpr}x scaling (${Math.round(screen2.width * dpr)} x ${Math.round(screen2.height * dpr)} real pixels)`;
  };
  var row = (label, value, confidence, note) => note === void 0 ? { label, value: value ?? UNAVAILABLE, confidence: value === null ? "read" : confidence } : { label, value: value ?? UNAVAILABLE, confidence: value === null ? "read" : confidence, note };
  var buildReport = (facts, now) => {
    const guess = facts.ua ? parseUserAgent(facts.ua) : null;
    const branded = facts.uaData ? pickBrand(facts.uaData.brands) : null;
    const merged = guess ? branded ? { ...guess, browser: branded.browser, major: branded.major } : guess : null;
    const currency = assessCurrency(merged, now);
    const gpu = describeGpu(facts.gl, facts.gpuAdapter);
    const browserValue = merged ? `${merged.browser === "other" ? "unrecognised" : merged.browser}${merged.major ? ` ${merged.major}` : ""}` : null;
    const sections = [
      {
        title: "Graphics",
        rows: [
          row(
            "Graphics card",
            gpu?.redacted ? null : gpu?.model ?? null,
            "read",
            gpu?.redacted ? "This browser deliberately hides it for privacy." : void 0
          ),
          row("Graphics vendor", gpu?.redacted ? null : gpu?.vendor ?? null, "read")
        ]
      },
      {
        title: "Processor and memory",
        rows: [
          row(
            "Processor threads",
            facts.hardwareConcurrency ? String(facts.hardwareConcurrency) : null,
            "reported",
            "Logical cores, and some browsers under-report this."
          ),
          row(
            "Memory",
            describeMemory(facts.deviceMemoryGb),
            "reported",
            "Browsers round this and cap it at 8 GB."
          )
        ]
      },
      {
        title: "System",
        rows: [
          row("Operating system", merged?.os ? `${merged.os}${merged.osVersion ? ` ${merged.osVersion}` : ""}` : null, "guessed"),
          row("Browser", browserValue, branded ? "read" : "guessed"),
          row("Touch screen", facts.maxTouchPoints === null ? null : facts.maxTouchPoints > 0 ? "yes" : "no", "read")
        ]
      },
      {
        title: "Display",
        rows: [
          row("Screen", describeDisplay(facts.screen, facts.devicePixelRatio), "read"),
          row("Colour depth", facts.screen ? `${facts.screen.colorDepth}-bit` : null, "read")
        ]
      },
      {
        title: "Connection and locale",
        rows: [
          row("Connection", describeConnection(facts.connection), "reported"),
          row("Time zone", facts.locale?.timeZone ?? null, "read"),
          row("Language", facts.locale?.locale ?? null, "read")
        ]
      }
    ];
    return { sections, currency, guess: merged };
  };
  var formatReport = (report, capturedAt) => {
    const lines = ["System report", `Taken ${capturedAt}`, ""];
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

  // src/index.ts
  var probeWebgl = () => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl", {
        powerPreference: "low-power",
        antialias: false,
        depth: false,
        stencil: false,
        alpha: false
      });
      if (!gl) return null;
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const read = (p) => {
        if (p === void 0) return null;
        const value = gl.getParameter(p);
        return typeof value === "string" && value.trim() !== "" ? value : null;
      };
      const result = {
        vendor: read(info?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR),
        renderer: read(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)
      };
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return result;
    } catch {
      return null;
    }
  };
  var probeWebgpu = async (nav) => {
    if (!nav.gpu) return null;
    try {
      const adapter = await nav.gpu.requestAdapter();
      const info = adapter?.info;
      if (!info) return null;
      return {
        vendor: info["vendor"] ?? "",
        architecture: info["architecture"] ?? "",
        description: info["description"] ?? ""
      };
    } catch {
      return null;
    }
  };
  var collect = async () => {
    const nav = navigator;
    let locale = null;
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions();
      locale = { locale: resolved.locale, timeZone: resolved.timeZone };
    } catch {
      locale = null;
    }
    return {
      ua: typeof nav.userAgent === "string" ? nav.userAgent : null,
      uaData: nav.userAgentData?.brands ? { brands: nav.userAgentData.brands, platform: nav.userAgentData.platform ?? null } : null,
      gl: probeWebgl(),
      gpuAdapter: await probeWebgpu(nav),
      hardwareConcurrency: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
      deviceMemoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
      connection: nav.connection ? {
        ...nav.connection.effectiveType !== void 0 && { effectiveType: nav.connection.effectiveType },
        ...nav.connection.downlink !== void 0 && { downlink: nav.connection.downlink },
        ...nav.connection.rtt !== void 0 && { rtt: nav.connection.rtt }
      } : null,
      screen: typeof screen !== "undefined" ? { width: screen.width, height: screen.height, colorDepth: screen.colorDepth } : null,
      devicePixelRatio: typeof devicePixelRatio === "number" ? devicePixelRatio : null,
      maxTouchPoints: typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints : null,
      locale,
      capturedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  };
  var rowNode = (r) => h(
    "div",
    { class: "sr-row" },
    h("dt", { class: "sr-label" }, r.label),
    h(
      "dd",
      { class: `sr-value${r.value.startsWith("not available") ? " sr-missing" : ""}` },
      r.value,
      r.note ? h("span", { class: "sr-hint" }, r.note) : null
    )
  );
  mount("[data-sr]", ({ root }) => {
    const out = root.querySelector("[data-sr-report]");
    const verdict = root.querySelector("[data-sr-verdict]");
    const status = root.querySelector("[data-sr-status]");
    const copyButton = root.querySelector("[data-sr-copy]");
    if (!out) return;
    void collect().then((facts) => {
      const now = /* @__PURE__ */ new Date();
      const report = buildReport(facts, now);
      const taken = now.toLocaleString(void 0, { dateStyle: "long", timeStyle: "short" });
      out.textContent = "";
      for (const section of report.sections) {
        out.append(
          h(
            "section",
            { class: "sr-section" },
            h("h3", { class: "sr-section-title" }, section.title),
            h("dl", { class: "sr-list" }, ...section.rows.map(rowNode))
          )
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
            status.textContent = ok ? "Report copied. Paste it into your message." : "This browser would not let the page copy it. Select the text and copy it yourself.";
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
})();

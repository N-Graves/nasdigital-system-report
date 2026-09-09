# nasdigital-system-report

What the computer you are on will admit to — graphics card, processor threads, memory, screen,
connection — formatted as plain text to paste into a support message. Runs in the browser and
uploads nothing.

Built for [nasdigital.co.uk](https://nasdigital.co.uk) as a drop-in artefact: one IIFE, one
stylesheet, and a demo page.

## The one that makes it different: it says what it cannot do

Every "check your PC" page on the internet claims to scan for outdated drivers. **No browser exposes
installed drivers to any page, ever.** Those pages are guessing from your graphics card model, or
selling something. This one says so, in the tool, and links the three real vendor download pages
instead.

The same instinct runs through the rest of it. Every row carries how much its value is worth —
`read` means the browser said so plainly, `reported` means the browser is allowed to round or fudge
it, `guessed` means we worked it out — because somebody may drive to a house based on this.

## Three things browsers lie about, and what this does instead

**`navigator.deviceMemory` is capped at 8 and rounded to a power of two.** A 64 GB workstation
reports `8`. Printing "8 GB" flatly is wrong, and its owner will tell you so; this says
**"8 GB or more"**.

**Firefox with `resistFingerprinting` returns the literal string `"Mozilla"`** for both the WebGL
vendor and renderer. Rendered as-is, the tool tells someone their graphics card is called Mozilla.
It is treated as hidden, and the row says the browser is deliberately withholding it.

**`navigator.userAgentData.brands` contains randomised fake entries by design** — `Not)A;Brand`,
`Not_A Brand`, ` Not A;Brand`, varying per build so nobody hardcodes a list. Taking `brands[0]` shows
a visitor "Not)A;Brand 99". They are filtered, and the most specific real brand wins.

## The browser-age check is an estimate, and expires

A hardcoded table of current versions is wrong within a month of being written and *confidently*
wrong within three — and the failure is asymmetric. Telling somebody with a fully updated browser
that it is out of date is far worse than saying nothing: it is unactionable, provably wrong to them,
and it discredits every other number on the page.

So it walks forward from a known release date at each browser's own cadence, with four rules:

- **Never flag "ahead."** A version above the estimate means our anchor is stale, not their browser.
- **Generous threshold.** Two or three behind is a gentle mention; four or more is worth saying.
- **The claim expires.** Past the extrapolation window it says it cannot tell rather than confidently
  predicting Chrome 260.
- **iOS and Safari get different wording**, because "update your browser" there means updating the
  operating system, and on an old Mac it can mean buying a new computer.

Opera and Samsung Internet have **no anchor on purpose**. Both keep their own numbering on their own
cadence and no reliable figure for either was verified, so they get "cannot tell" — the honest answer.

## Integration

Copy `dist/system-report.js` and `dist/system-report.css` into the site's assets. Plain IIFE; does
nothing unless the page contains `[data-sr]`. The markup lives in the page and the bundle finds it.

| Attribute | On | Purpose |
|---|---|---|
| `data-sr` | the root `<section>` | Mount point |
| `data-sr-report` | a `<div>` | Where the sections are written |
| `data-sr-verdict` | a `<p>` | The browser-age line |
| `data-sr-status` | a `<p role="status">` | Copy result. The only live region |
| `data-sr-copy` | a `<button>` | Copies the whole report as plain text |

The driver disclaimer is **static markup in the page**, not injected — it must be readable with
JavaScript off, because it is the honest part.

Don't put `data-reveal` on anything the tool writes into: nasdigital's `fx.js` snapshots those once
at load, so an element injected afterwards stays at `opacity: 0` forever.

## The WebGL probe

One detached canvas, a `low-power` context so a dual-GPU laptop does not wake the discrete card, two
strings read, then `WEBGL_lose_context` called explicitly. Browsers cap live WebGL contexts, and this
bundle drops onto a site alongside other things — one leaked context is one fewer for everyone else
on the page. Dropping the reference relies on garbage collection, which is not a release.

`navigator.gpu` is used as a fallback when WebGL says nothing, because
`WEBGL_debug_renderer_info` is on a slow deprecation track.

## Structured data

`demo/index.html` carries a `WebApplication` block for the site to lift. No rating, no review count —
there aren't any and inventing them is a manual action.

## Security posture

Checked rather than asserted; `npm run smoke` runs 19 assertions against the built bundle. No
`fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` or `EventSource`; no `localStorage`,
`sessionStorage`, `indexedDB` or `document.cookie`; no external URL outside the banner; no inline
handlers; bails silently in a bare `vm` sandbox. Verified in a real browser too: loading and
generating the report produced **three** network requests — the page, its stylesheet and its script —
and nothing else.

## Testing

```bash
npm run lint    # tsc --noEmit
npm test        # 58 tests
npm run smoke   # 19 assertions against the built bundle
npm run demo    # serves demo/ on http://127.0.0.1:4181
```

The adapter reads the browser into one plain `RawFacts` object and everything downstream is pure, so
the parts that actually go wrong are testable without a browser. The user-agent table is the
valuable half: Edge, Opera and Samsung Internet all contain "Chrome", Chrome's own string contains
"Safari", and Safari's contains a WebKit build number that looks exactly like a version and is not
one. Each has its own row.

What is genuinely untestable is whether `canvas.getContext('webgl')` returns anything and whether
`WEBGL_debug_renderer_info` is present. There is no honest substitute for opening it in a real
browser, so that is what was done — it read this machine's RTX 5090 correctly, and independently
worked out that the Chrome it was running in was two versions behind stable.

## Built on

[`@nasdigitaluk/withnate-tool-core`](https://github.com/N-Graves/withnate-tool-core) for `mount`,
`h` and `copyText`.

## Licence

MIT. See [LICENSE](LICENSE).

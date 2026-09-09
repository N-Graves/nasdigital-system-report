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


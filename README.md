# Keep Club Tier Tracker

A static GitHub Pages app for analyzing a Fairphone Keep Club export.

## Export format

Upload a CSV or TSV file with these columns:

- `Date`
- `Challenge`
- `Points`
- `Approved`

`Approved` can contain `Approved`, `true`, `yes`, `y`, or `1`.

## Calculations

- Tier eligibility uses approved points in the rolling 12-month window.
- Keep Club points expire 36 months after the earning date.
- Entries drop out of the tier window 12 months after the earning date.
- Tier thresholds follow the workbook mappings:
  - Copper: 0 points, 1 point per 1 EUR
  - Silver: 150 points, 1.25 points per 1 EUR
  - Gold: 500 points, 1.5 points per 1 EUR

## GitHub Pages

Publish from the repository root. The app is dependency-free and runs from `index.html`.

## Local commands

- `make serve` starts a local server on port `8000`.
- `make open` opens the app in your browser.
- `make deploy` pushes the current commit to `origin/gh-pages`.
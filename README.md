# home-prices

Daily supermarket prices for a private household app (Rami Levy Ha-Sivim 37, Petah Tikva;
Osher Ad and Yochananof can be turned back on in scripts/download.mjs).

The data comes from the price files the chains publish under Israel's price-transparency law.
A GitHub Actions job (`.github/workflows/daily-prices.yml`) downloads them every morning and
publishes one compact file, `prices.json`, on GitHub Pages.

Run locally: `npm ci && node scripts/fetch-prices.mjs` (writes `data/prices.json`).

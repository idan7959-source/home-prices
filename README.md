# home-prices

Daily supermarket prices for a private household app (3 stores in Petah Tikva:
Rami Levy Ha-Sivim 37, Osher Ad Segula, Yochananof Segula).

The data comes from the price files the chains publish under Israel's price-transparency law.
A GitHub Actions job (`.github/workflows/daily-prices.yml`) downloads them every morning and
publishes one compact file, `prices.json`, on GitHub Pages.

Run locally: `npm ci && node scripts/fetch-prices.mjs` (writes `data/prices.json`).

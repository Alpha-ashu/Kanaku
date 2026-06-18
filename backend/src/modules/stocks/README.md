# stocks module

> Public stock/market quotes proxy.

**Base path:** `/api/v1/stocks`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/stocks/markets` | public | `stockController.getMarkets` |
| GET | `/stocks/search` | public | `stockController.searchStocks` |
| GET | `/stocks/stock` | public | `stockController.getStockQuote` |
| GET | `/stocks/batch` | public | `stockController.getBatchQuotes` |

## Files

- `README.md`
- `stock.controller.ts`
- `stock.routes.ts`

## Canonical-shape conformance

✅ controller · — service · — repository · — validation · ✅ routes · — types

---
_Auto-generated from `stocks/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._

import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

function getMockCommodityChart(ySymbol: string) {
  const sym = ySymbol.toUpperCase();
  if (sym === 'PETROL' || sym === 'DIESEL' || sym === 'LPG') {
    let price = 102.12;
    let name = 'Petrol Rate India';
    if (sym === 'DIESEL') {
      price = 95.20;
      name = 'Diesel Rate India';
    } else if (sym === 'LPG') {
      price = 913.00;
      name = 'LPG Cylinder Rate India';
    }

    const seed = new Date().getDate();
    const fluctuationPercent = (Math.sin(seed) * 0.1) / 100;
    const prevClose = price / (1 + fluctuationPercent);
    const lastPrice = price;

    return {
      meta: {
        regularMarketPrice: lastPrice,
        chartPreviousClose: prevClose,
        previousClose: prevClose,
        longName: name,
        shortName: name,
        regularMarketOpen: prevClose,
        regularMarketDayHigh: Math.max(lastPrice, prevClose) * 1.002,
        regularMarketDayLow: Math.min(lastPrice, prevClose) * 0.998,
        regularMarketVolume: 1000,
        currency: 'INR',
        exchangeName: 'MCX',
      },
      yahooSym: ySymbol,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dev-only stock API plugin  replicates api/stocks.ts for the Vite dev server
// so /api/v1/stocks/* works without a running backend or Vercel CLI.
// Registered via configureServer (no return value) so it runs BEFORE the proxy.
// ---------------------------------------------------------------------------
function stockApiDevPlugin() {
  const YAHOO_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
  }

  function toYahooSym(symbol: string, market?: string) {
    const s = symbol.trim().toUpperCase()
    if (s.endsWith('.US')) return s.slice(0, -3)   // AAPL.US  AAPL
    if (/[.=^-]/.test(s)) return s                  // already qualified
    if (market === 'bse') return `${s}.BO`
    if (market === 'nse') return `${s}.NS`
    return s
  }

  async function fetchChart(yahooSym: string) {
    const mock = getMockCommodityChart(yahooSym);
    if (mock) return mock;
    const ypath = `/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1d&range=1d&_=${Date.now()}`
    for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
      try {
        const r = await fetch(`https://${host}${ypath}`, {
          headers: {
            ...YAHOO_HEADERS,
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          signal: AbortSignal.timeout(8000)
        })
        if (!r.ok) continue
        const json = await r.json()
        const result = (json as any)?.chart?.result?.[0]
        if (result?.meta?.regularMarketPrice != null) return { meta: result.meta, yahooSym }
      } catch { /* try next host */ }
    }
    return null
  }

  function detectExchange(meta: any, sym: string) {
    const ex = String(meta?.exchangeName || '').toUpperCase()
    if (ex.includes('BSE') || sym.endsWith('.BO')) return 'BSE'
    if (ex.includes('NSE') || ex.includes('NSI') || sym.endsWith('.NS')) return 'NSE'
    if (ex.includes('NAS') || ex.includes('NYS') || ['NMS', 'NGM', 'NYQ', 'PCX'].includes(ex)) return 'US'
    if (ex.includes('CCY') || sym.includes('=X')) return 'FOREX'
    if (ex.includes('CCC') || sym.includes('-USD')) return 'CRYPTO'
    return ex || 'NSE'
  }

  function currencySymbol(code?: string, exchange?: string) {
    const map: Record<string, string> = { INR: '', USD: '$', EUR: '', GBP: '', JPY: '', AUD: 'A$', CAD: 'C$' }
    const c = String(code || '').toUpperCase()
    return map[c] ?? ((exchange === 'NSE' || exchange === 'BSE') ? '' : '$')
  }

  function mktState(meta: any, exchange: string) {
    if (exchange === 'CRYPTO') return 'open'
    const reg = meta?.currentTradingPeriod?.regular
    if (!reg?.start || !reg?.end) return 'unknown'
    const now = Math.floor(Date.now() / 1000)
    return (now >= reg.start && now <= reg.end) ? 'open' : 'closed'
  }

  function toPayload(symbol: string, yahooSym: string, meta: any) {
    const exchange = detectExchange(meta, yahooSym)
    const last = Number(meta?.regularMarketPrice ?? 0)
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose ?? last)
    const change = last - prev
    return {
      status: 'success', symbol, exchange,
      currency: currencySymbol(meta?.currency, exchange),
      marketState: mktState(meta, exchange),
      data: {
        company_name: meta?.longName || meta?.shortName || symbol,
        last_price: last, change,
        percent_change: prev ? (change / prev) * 100 : 0,
        previous_close: prev,
        open: Number(meta?.regularMarketOpen ?? last),
        day_high: Number(meta?.regularMarketDayHigh ?? last),
        day_low: Number(meta?.regularMarketDayLow ?? last),
        year_high: Number(meta?.fiftyTwoWeekHigh ?? 0),
        year_low: Number(meta?.fiftyTwoWeekLow ?? 0),
        volume: Number(meta?.regularMarketVolume ?? 0),
        market_cap: 0, pe_ratio: 0, dividend_yield: 0, earnings_per_share: 0,
        sector: 'Unknown', last_update: new Date().toISOString(),
      },
    }
  }

  function send(res: any, status: number, body: unknown) {
    const json = JSON.stringify(body)
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(json)
  }

  return {
    name: 'stock-api-dev',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: () => void) => {
        const url: string = req.url ?? ''
        if (!url.startsWith('/api/v1/stocks')) { next(); return }
        if (req.method === 'OPTIONS') { send(res, 200, {}); return }
        if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed' }); return }

        const full = new URL(url, 'http://localhost')
        const endpoint = full.pathname.replace(/^\/api\/v1\/stocks\/?/, '')
        const sp = full.searchParams

        // GET /api/v1/stocks/markets
        if (endpoint === 'markets') {
          const mkt = sp.get('market') || 'nse'
          const defaults: Record<string, string[]> = {
            nse: ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS'],
            bse: ['RELIANCE.BO', 'TCS.BO', 'INFY.BO', 'HDFCBANK.BO', 'ICICIBANK.BO'],
            us: ['AAPL', 'TSLA', 'MSFT', 'NVDA', 'GOOGL'],
            forex: ['USDINR=X', 'EURUSD=X', 'GBPUSD=X', 'USDJPY=X'],
            crypto: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD'],
          }
          send(res, 200, { status: 'success', market: mkt, symbols: defaults[mkt] ?? defaults.nse })
          return
        }

        // GET /api/v1/stocks/search?q=...
        if (endpoint === 'search') {
          const q = (sp.get('q') ?? '').trim()
          if (!q) { send(res, 200, { status: 'success', results: [] }); return }
          try {
            const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15`, {
              headers: YAHOO_HEADERS, signal: AbortSignal.timeout(8000),
            })
            if (!r.ok) { send(res, 502, { error: 'Upstream failed' }); return }
            const json = await r.json() as any
            send(res, 200, {
              status: 'success',
              results: (json?.quotes ?? []).slice(0, 12).map((x: any) => ({
                symbol: x.symbol, company_name: x.shortname || x.longname || x.symbol,
                exchange: x.exchange ?? '', nse_url: '', bse_url: '',
              })),
            })
          } catch { send(res, 502, { error: 'Upstream failed' }) }
          return
        }

        // GET /api/v1/stocks/stock?symbol=...&market=...
        if (endpoint === 'stock') {
          const sym = (sp.get('symbol') ?? '').trim()
          const mkt = sp.get('market')?.trim() || undefined
          if (!sym) { send(res, 400, { status: 'error', message: 'symbol required' }); return }
          let chart = await fetchChart(toYahooSym(sym, mkt))
          if (!chart && !mkt && !/[.=^-]/.test(sym.toUpperCase())) {
            chart = await fetchChart(`${sym.toUpperCase()}.NS`) // NSE fallback for bare symbols
          }
          if (!chart) { send(res, 404, { status: 'error', message: 'Not found' }); return }
          send(res, 200, toPayload(sym, chart.yahooSym, chart.meta))
          return
        }

        // GET /api/v1/stocks/batch?symbols=A,B,C&market=...
        if (endpoint === 'batch') {
          const rawSyms = (sp.get('symbols') ?? '').trim()
          const mkt = sp.get('market')?.trim() || undefined
          if (!rawSyms) { send(res, 400, { status: 'error', message: 'symbols required' }); return }
          const symbols = rawSyms.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20)
          const results: Record<string, unknown> = {}
          await Promise.allSettled(symbols.map(async sym => {
            const chart = await fetchChart(toYahooSym(sym, mkt))
            results[sym] = chart ? toPayload(sym, chart.yahooSym, chart.meta) : null
          }))
          send(res, 200, { status: 'success', results })
          return
        }

        send(res, 404, { error: 'Endpoint not mapped' })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3000'

  return {
    publicDir: 'frontend/public',
    plugins: [react(), tailwindcss(), stockApiDevPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './frontend/src'),
      },
    },

    assetsInclude: ['**/*.svg', '**/*.csv'],

    build: {
      // Target modern browsers for smaller output
      target: 'es2020',
      chunkSizeWarningLimit: 600,
      // Enable CSS code splitting per chunk
      cssCodeSplit: true,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          // Smart manual chunk splitting  vendors in separate cacheable chunks
          manualChunks(id) {
            //  Heavy UI libs 
            if (id.includes('node_modules/@mui')) return 'vendor-mui';
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) return 'vendor-charts';
            if (id.includes('node_modules/pdfjs-dist')) return 'vendor-pdf';
            if (id.includes('node_modules/@capacitor')) return 'vendor-capacitor';

            //  Core React ecosystem 
            if (id.includes('node_modules/react-dom')) return 'vendor-react';
            if (id.includes('node_modules/react/')) return 'vendor-react';
            if (id.includes('node_modules/framer-motion') || id.includes('node_modules/motion')) return 'vendor-motion';

            //  Supabase 
            if (id.includes('node_modules/@supabase')) return 'vendor-supabase';

            //  Database / offline 
            if (id.includes('node_modules/dexie')) return 'vendor-dexie';

            //  Radix UI components 
            if (id.includes('node_modules/@radix-ui')) return 'vendor-radix';

            //  Utilities 
            if (id.includes('node_modules/date-fns')) return 'vendor-utils';
            if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
            if (id.includes('node_modules/sonner')) return 'vendor-utils';
            if (id.includes('node_modules/clsx') || id.includes('node_modules/tailwind-merge')) return 'vendor-utils';

            //  Fonts 
            if (id.includes('node_modules/@fontsource')) return 'vendor-fonts';
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },

    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'framer-motion',
        '@supabase/supabase-js',
        'dexie',
        'dexie-react-hooks',
        'lucide-react',
      ],
    },

    server: {
      port: 9002,
      host: true,
      proxy: {
        '/api/v1': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
        '/health': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})

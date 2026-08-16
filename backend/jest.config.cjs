// Renamed from jest.config.ts (2026-08): Jest 30's TypeScript config loader
// couldn't parse this file's `export default` syntax inside a `"type":
// "commonjs"` package — neither its native Node type-stripping path (which
// only strips type annotations, not ESM module syntax) nor its ts-node-backed
// loader path (which errored internally against the new TypeScript major)
// could load it. The config itself used no TypeScript-specific syntax, so
// removing the .ts layer entirely — plain `module.exports` — sidesteps the
// ambiguity rather than chasing a Jest/ts-node/TypeScript version alignment.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Test suites live in the central quality/ hub, not under backend/.
  // rootDir stays at backend/ so collectCoverageFrom('src/**') still targets backend source.
  roots: ['<rootDir>/../quality/backend'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).[tj]s',
    '**/integration/*.js',
    '**/integration/*.ts',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '../quality/backend/tests/tsconfig.json' }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/server.ts',
  ],
  setupFiles: ['<rootDir>/../quality/backend/tests/setup.ts'],
  // Closes each test FILE's database connections as that file finishes. Every
  // file gets its own module registry and therefore its own PrismaClient; with
  // maxWorkers=1 they all share one process, so without this they accumulate
  // across the run and exhaust the pgBouncer pool mid-way. See the file header.
  setupFilesAfterEnv: ['<rootDir>/../quality/backend/tests/afterEachFile.ts'],
  // Belt and braces for the end of the whole run, and for connections opened
  // outside any test file.
  globalTeardown: '<rootDir>/../quality/backend/tests/globalTeardown.ts',
  // Integration tests share a single Postgres test database, so they MUST run
  // serially — parallel workers race and contaminate each other's rows, which
  // shows up as different tests "flakily" failing on each run. Forcing one
  // worker here makes every `jest` invocation deterministic, regardless of which
  // npm script invoked it. (For parallel-safe tests, isolate a DB per worker.)
  maxWorkers: 1,
  // The integration suites run against a REMOTE Postgres (see backend/.env.test),
  // so every query pays network latency. A multi-leg ledger posting is a dozen
  // sequential round trips inside one transaction and legitimately takes several
  // seconds there — against a co-located production database it is far quicker.
  //
  // 30s was tight enough that slow-network runs failed on the clock rather than
  // on behaviour. Raising this does not hide a bug: Prisma still aborts a genuinely
  // stuck transaction at PRISMA_TX_TIMEOUT_MS (20s default, see db/prisma.ts).
  //
  // The real fix is a local or co-located test database; this keeps the suite
  // honest until then.
  testTimeout: 60000,
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
};

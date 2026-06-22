export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).[tj]s',
    '**/integration/*.js',
    '**/integration/*.ts',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tests/tsconfig.json' }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/server.ts',
  ],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  // Integration tests share a single Postgres test database, so they MUST run
  // serially — parallel workers race and contaminate each other's rows, which
  // shows up as different tests "flakily" failing on each run. Forcing one
  // worker here makes every `jest` invocation deterministic, regardless of which
  // npm script invoked it. (For parallel-safe tests, isolate a DB per worker.)
  maxWorkers: 1,
  // Test groups for targeted runs
  testTimeout: 30000,
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

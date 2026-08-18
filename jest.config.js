/** @type {import('jest').Config} */
const tsPreset = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};

module.exports = {
  // Coverage is aggregated across all projects into one report and gate.
  // Per ADR 0008 we collect from all of src (no blanket file exclusions) and
  // rely on targeted, documented `istanbul ignore` for genuinely untestable
  // lines (e.g. the main.ts bootstrap).
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 95,
      functions: 95,
      lines: 95,
    },
  },
  projects: [
    {
      ...tsPreset,
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
    },
    {
      ...tsPreset,
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.int.test.ts'],
      // Integration tests hit a real database; load DATABASE_URL from .env the
      // same way prisma.config.ts does (jest does not read .env on its own).
      setupFiles: ['dotenv/config'],
    },
    {
      ...tsPreset,
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/**/*.e2e.test.ts'],
    },
  ],
};

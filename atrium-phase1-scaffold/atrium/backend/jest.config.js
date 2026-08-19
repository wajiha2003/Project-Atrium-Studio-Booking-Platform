/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^@modules/(.*)$': '<rootDir>/modules/$1',
    '^@middleware/(.*)$': '<rootDir>/middleware/$1',
    '^@database/(.*)$': '<rootDir>/database/$1',
    '^@services/(.*)$': '<rootDir>/services/$1',
    '^@workers/(.*)$': '<rootDir>/workers/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  testTimeout: 30000,
  // Concurrency proof tests must run in-band against a real Postgres instance,
  // never mocked - see src/tests/concurrency/README.md
  maxWorkers: 1
};

/** @type {import('jest').Config} */
const babelConfig = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
}

module.exports = {
  testEnvironment: 'jest-environment-node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  transform: {
    '^.+\\.(js|jsx)$': ['babel-jest', babelConfig],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(@prisma/client)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testTimeout: 30000,
  verbose: true,
}

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts'],
  coverageDirectory: 'coverage',
  moduleNameMapper: {
    '^@dra/types$': '<rootDir>/../../libs/types/src/index',
    '^@dra/types/(.*)$': '<rootDir>/../../libs/types/src/$1',
  },
};

import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve('src/shared') }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Electron is not available in the test process. Anything importing it must
    // be behind a seam; the pure modules (schema, parsers, validation) are the target.
    exclude: ['node_modules/**', 'out/**', 'release/**']
  }
})

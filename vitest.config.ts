import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    {
      // Bun imports a `.txt` asset as its text (`with { type: 'text' }`); Vite ignores import attributes, so the
      // tests get the same string this way.
      name: 'text-asset',
      enforce: 'pre',
      load: (id) => (id.endsWith('.txt') ? `export default ${JSON.stringify(readFileSync(id, 'utf8'))}` : null)
    }
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    reporters: ['tree'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'reports/coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/tests/**'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100
      }
    }
  }
})

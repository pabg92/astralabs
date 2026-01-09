import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Prevent loading parent project's postcss.config.mjs (requires Tailwind)
  css: {
    postcss: {},
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
  }
})

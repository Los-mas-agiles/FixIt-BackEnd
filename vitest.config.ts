import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Valores falsos: los tests nunca tocan la base de datos real ni APIs externas.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'secreto-solo-para-tests-0123456789abcdef',
    },
  },
})

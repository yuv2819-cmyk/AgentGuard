import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/agentguard_test',
      JWT_SECRET: 'test_jwt_secret_that_is_long_enough',
      AGENT_KEY_SALT: 'test_agent_key_salt',
      CORS_ORIGIN: 'http://localhost:3000',
      PORT: '4000',
      NODE_ENV: 'test',
    },
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});

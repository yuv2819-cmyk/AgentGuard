process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/agentguard_test';
process.env.JWT_SECRET ??= 'test_jwt_secret_that_is_long_enough';
process.env.AGENT_KEY_SALT ??= 'test_agent_key_salt';
process.env.CORS_ORIGIN ??= 'http://localhost:3000';
process.env.PORT ??= '4000';
process.env.NODE_ENV ??= 'test';

import { applyTestEnv } from './test-env';

// Jest runs this before every e2e test file (see "setupFiles" in jest-e2e.json).
applyTestEnv(process.env);

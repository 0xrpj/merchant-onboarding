import { join } from 'node:path';
import { register } from 'tsconfig-paths';

// Jest's moduleNameMapper doesn't apply to globalSetup, so teach Node's own
// require() the @/ alias here. Must be the first import in global-setup.ts.
register({
  baseUrl: join(__dirname, '..'),
  paths: { '@/*': ['src/*'] },
});

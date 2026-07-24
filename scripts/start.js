import { initializeConfig } from './config-service.js';

await initializeConfig();
await import('../build/index.js');

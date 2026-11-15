import { config } from 'zod';

/*
 * Zod compiles a fast path for each object schema with `new Function`, and probes for it the
 * same way. The Content Security Policy grants no `unsafe-eval`, so the browser would refuse the
 * compile, and while the policy only reports, it logs every compile as a violation. The browser
 * parses with Zod's interpreter instead: the same results, without evaluating generated code.
 * Zod reads this flag when a schema is defined, so `hooks.client.ts` imports this module before
 * anything that defines one.
 */
config({ jitless: true });

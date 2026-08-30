import { describe, expect, it } from 'vitest';
import { analyzeSource } from './audit-source-rules';
const violations = (source: string) => analyzeSource('example.ts', source);
describe('source audit rules', () => {
	it('rejects an asserted object shape', () => {
		expect(violations('const value = ({ id: maybe }) as never')).toHaveLength(1);
	});
	it('rejects moving a whole local shape through never', () => {
		expect(violations('controller.save(input as never)')).toHaveLength(1);
	});
	it('allows a branded leaf property cast', () => {
		expect(violations('controller.get(input.noteId as never)')).toHaveLength(0);
	});
	it('rejects moving a call result through never', () => {
		expect(violations('controller.save(buildInput() as never)')).toHaveLength(1);
	});
	it('allows const assertions', () => {
		expect(violations("const value = { kind: 'ok' } as const")).toHaveLength(0);
	});
	it('rejects a swallowed synchronous failure', () => {
		expect(violations('try { work() } catch { return [] }')).toHaveLength(1);
	});
	it('rejects a swallowed Promise rejection', () => {
		expect(violations('void work().catch(() => undefined)')).toHaveLength(1);
	});
	it('allows propagation', () => {
		expect(violations('try { work() } catch (error) { throw error }')).toHaveLength(0);
	});
	it('allows explicit failure results', () => {
		expect(violations('try { work() } catch (error) { return { ok: false, error } }')).toHaveLength(
			0
		);
	});
	it('allows a discriminated corrupt result', () => {
		expect(
			violations("try { work() } catch (error) { return { kind: 'corrupt', error } }")
		).toHaveLength(0);
	});
	it('rejects a plausible weaker string result', () => {
		expect(violations("try { work() } catch { return '[unserializable]' }")).toHaveLength(1);
	});
	it('rejects a bare false result', () => {
		expect(violations('try { work() } catch { return false }')).toHaveLength(1);
	});
	it('rejects logging as failure handling', () => {
		expect(violations('try { work() } catch (error) { logger.warn(error) }')).toHaveLength(1);
	});
	it('rejects renamed reporting variables and calls', () => {
		expect(
			violations(
				"try { await work() } catch (problem) { state.outcome = 'failed'; reportProblem(problem) }"
			)
		).toHaveLength(1);
	});
	it('does not count a nested callback throw as propagation', () => {
		expect(violations('try { work() } catch { queue(() => { throw new Error() }) }')).toHaveLength(
			1
		);
	});
	it('requires a reason on allowances', () => {
		expect(violations('// audit-allow: silent-catch\ntry {} catch {}')).toHaveLength(2);
	});
	it('rejects stale allowances', () => {
		expect(violations('// audit-allow: silent-catch — terminal reporter\nwork()')).toHaveLength(1);
	});
	it('rejects instanceof in models', () => {
		expect(analyzeSource('src/lib/models/example.ts', 'value instanceof Error')).toHaveLength(1);
	});
	it('allows instanceof outside models', () => {
		expect(analyzeSource('src/lib/client/example.ts', 'value instanceof Error')).toHaveLength(0);
	});
	it('reports source lines with an extraction offset', () => {
		expect(analyzeSource('example.svelte', 'const value = ({ id }) as never', 12)[0]?.line).toBe(
			13
		);
	});
	it('rejects a concrete cast on response JSON', () => {
		expect(violations('const body = (await response.json()) as { ok: boolean }')).toHaveLength(1);
	});
	it('allows an honest unknown response JSON intermediate', () => {
		expect(violations('const body = (await response.json()) as unknown')).toHaveLength(0);
	});
	it('allows a reasoned response JSON framework exception', () => {
		expect(
			violations(
				'// audit-allow: no-response-json-cast — Framework supplies runtime validation.\nconst body = (await response.json()) as Payload'
			)
		).toHaveLength(0);
	});
	it('rejects a Zod unknown schema', () => {
		expect(violations("import { z } from 'zod';\nconst payload = z.unknown()")).toHaveLength(1);
	});
	it('rejects an aliased Zod any schema', () => {
		expect(
			violations("import { z as schema } from 'zod';\nconst payload = schema.any()")
		).toHaveLength(1);
	});
	it('rejects a namespace-imported Zod unknown schema', () => {
		expect(
			violations("import * as schema from 'zod';\nconst payload = schema.unknown()")
		).toHaveLength(1);
	});
	it('allows a concrete Zod JSON schema', () => {
		expect(violations("import { z } from 'zod';\nconst payload = z.json()")).toHaveLength(0);
	});
	it('allows a reasoned Zod SDK exception', () => {
		expect(
			violations(
				"import { z } from 'zod';\n// audit-allow: no-zod-unknown — SDK callback owns runtime validation.\nconst payload = z.unknown()"
			)
		).toHaveLength(0);
	});
	it('rejects a stale Zod allowance', () => {
		expect(
			violations(
				"import { z } from 'zod';\n// audit-allow: no-zod-unknown — SDK callback owns runtime validation.\nconst payload = z.string()"
			)
		).toHaveLength(1);
	});
});

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
});

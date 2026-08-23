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
	it('allows an explicit failure string', () => {
		expect(violations("try { work() } catch { return '[unserializable]' }")).toHaveLength(0);
	});
	it('allows an explicit false failure result', () => {
		expect(violations('try { work() } catch { return false }')).toHaveLength(0);
	});
	it('allows a persisted failed status', () => {
		expect(
			violations(
				"try { await work() } catch (error) { await repository.update({ status: 'failed', error }) }"
			)
		).toHaveLength(0);
	});
	it('requires a reason on allowances', () => {
		expect(violations('// audit-allow: silent-catch\ntry {} catch {}')).toHaveLength(2);
	});
	it('rejects stale allowances', () => {
		expect(violations('// audit-allow: silent-catch — terminal reporter\nwork()')).toHaveLength(1);
	});
});

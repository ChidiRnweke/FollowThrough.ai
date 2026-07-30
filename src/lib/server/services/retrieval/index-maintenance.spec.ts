import { describe, expect, it } from 'vitest';
import { KnowledgeIndexMaintenance } from './index-maintenance';

describe('KnowledgeIndexMaintenance', () => {
	it('is available as a domain service', () => {
		expect(KnowledgeIndexMaintenance).toBeTypeOf('function');
	});
});

import { describe, it, expect } from 'vitest';
import { formatBytes } from './labels';

describe('formatBytes', () => {
	it('reports whole bytes without a decimal', () => {
		expect(formatBytes(512)).toBe('512 B');
	});

	it('rounds kilobytes to one decimal', () => {
		expect(formatBytes(113409)).toBe('110.8 KB');
	});

	it('scales into megabytes', () => {
		expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
	});

	it('treats zero as zero bytes', () => {
		expect(formatBytes(0)).toBe('0 B');
	});
});

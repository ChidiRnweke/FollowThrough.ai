/* eslint-disable @typescript-eslint/ban-ts-comment -- imported runtime JavaScript exposes inferred internals. */
// @ts-nocheck -- exercises the plain-JavaScript OTel preload helpers.
import { describe, expect, test } from 'vitest';
import { formatBody, recordAttributes } from '../../../scripts/log-record.js';
import { ExternalServiceError } from '$lib/errors';

describe('formatBody', () => {
	test('renders an error instead of the empty object JSON.stringify would produce', () => {
		expect(formatBody(['OAuth callback error:', new Error('token exchange failed')])).toBe(
			'OAuth callback error: Error: token exchange failed'
		);
	});

	test('follows the cause chain down to the underlying reason', () => {
		const error = new ExternalServiceError('Generated document could not be stored', {
			cause: 'NoSuchBucket: the specified bucket does not exist'
		});
		expect(formatBody([error])).toBe(
			'ExternalServiceError: Generated document could not be stored (EXTERNAL_SERVICE) <- NoSuchBucket: the specified bucket does not exist'
		);
	});

	test('survives a circular argument that would otherwise drop the record', () => {
		const circular: Record<string, unknown> = { name: 'loop' };
		circular.self = circular;
		expect(formatBody([circular])).toBe('[unserializable]');
	});

	test('leaves a plain string untouched', () => {
		expect(formatBody(['[worker] stopped'])).toBe('[worker] stopped');
	});
});

describe('recordAttributes', () => {
	test('lifts the subsystem tag out of the message prefix', () => {
		expect(recordAttributes(['[agent-run] tick failed'])['log.tag']).toBe('agent-run');
	});

	test('carries the stack trace that the string body never had', () => {
		const error = new Error('boom');
		expect(recordAttributes(['[worker]', error])['exception.stacktrace']).toBe(error.stack);
	});

	test('exposes the domain code as its own attribute', () => {
		const error = new ExternalServiceError('Generated document could not be stored');
		expect(recordAttributes(['[domain]', error])['error.code']).toBe('EXTERNAL_SERVICE');
	});

	test('exposes the normalized cause the throw site captured', () => {
		const error = new ExternalServiceError('Generated document could not be stored', {
			cause: 'NoSuchBucket'
		});
		expect(recordAttributes([error])['error.details.cause']).toBe('NoSuchBucket');
	});

	test('adds no exception attributes when no argument is an error', () => {
		expect(recordAttributes(['[worker] stopped'])['exception.type']).toBeUndefined();
	});
});

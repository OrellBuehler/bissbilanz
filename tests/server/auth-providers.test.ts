import { describe, expect, test } from 'vitest';
import {
	credentialsFor,
	isProviderId,
	providerDefs,
	providerIds
} from '../../src/lib/server/auth-providers';

describe('provider registry', () => {
	test('isProviderId accepts known providers and rejects others', () => {
		expect(isProviderId('infomaniak')).toBe(true);
		expect(isProviderId('nope')).toBe(false);
		expect(isProviderId('../etc/passwd')).toBe(false);
	});

	test('every provider id has a definition whose id matches its key', () => {
		for (const id of providerIds) {
			expect(providerDefs[id]?.id).toBe(id);
		}
	});

	test('credentialsFor returns null unless both client id and secret are set', () => {
		expect(credentialsFor('infomaniak', {})).toBeNull();
		expect(credentialsFor('infomaniak', { clientId: 'id' })).toBeNull();
		expect(credentialsFor('infomaniak', { clientSecret: 'secret' })).toBeNull();
		expect(credentialsFor('infomaniak', { clientId: '  ', clientSecret: 'secret' })).toBeNull();
	});

	test('credentialsFor returns trimmed credentials when configured', () => {
		expect(credentialsFor('infomaniak', { clientId: ' id ', clientSecret: ' secret ' })).toEqual({
			clientId: 'id',
			clientSecret: 'secret'
		});
	});
});

describe('claim mapping', () => {
	test('infomaniak prefers userinfo claims and tolerates missing optional fields', () => {
		const profile = providerDefs.infomaniak.mapClaims(
			{ sub: 'from-id-token' },
			{ sub: 'from-userinfo', email: 'a@b.ch', name: 'Ada', picture: 'https://img/x.png' }
		);
		expect(profile).toEqual({
			sub: 'from-userinfo',
			email: 'a@b.ch',
			name: 'Ada',
			avatarUrl: 'https://img/x.png'
		});
	});

	test('infomaniak falls back to the id_token subject', () => {
		const profile = providerDefs.infomaniak.mapClaims({ sub: 'from-id-token' }, {});
		expect(profile.sub).toBe('from-id-token');
		expect(profile.email).toBeUndefined();
		expect(profile.name).toBeUndefined();
		expect(profile.avatarUrl).toBeUndefined();
	});

	test('google maps id_token claims without a userinfo call', () => {
		expect(providerDefs.google.userinfoEndpoint).toBeUndefined();
		expect(
			providerDefs.google.mapClaims({
				sub: 'g-1',
				email: 'a@gmail.com',
				name: 'Ada',
				picture: 'https://lh3.googleusercontent.com/x'
			})
		).toEqual({
			sub: 'g-1',
			email: 'a@gmail.com',
			name: 'Ada',
			avatarUrl: 'https://lh3.googleusercontent.com/x'
		});
	});

	test('empty-string claims are treated as absent so they cannot wipe stored values', () => {
		const profile = providerDefs.infomaniak.mapClaims(
			{ sub: 'x' },
			{ sub: 'x', email: '', name: '', picture: '' }
		);
		expect(profile.email).toBeUndefined();
		expect(profile.name).toBeUndefined();
		expect(profile.avatarUrl).toBeUndefined();
	});
});

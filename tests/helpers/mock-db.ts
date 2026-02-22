/**
 * Mock Drizzle DB factory for testing
 *
 * Creates a chainable mock that supports the Drizzle query builder pattern.
 * All methods (select, from, where, insert, etc.) return the chain, which is
 * PromiseLike so `await` resolves to a configurable result.
 */

import { mock } from 'bun:test';

type AnyFunction = (...args: any[]) => any;

interface MockChain extends Promise<any> {
	[key: string]: AnyFunction;
}

interface MockDB {
	[key: string]: any;
	query: {
		[key: string]: {
			findFirst: AnyFunction;
			findMany: AnyFunction;
		};
	};
}

interface MockDBFactory {
	db: MockDB;
	setResult: (result: any) => void;
	setError: (error: Error) => void;
	reset: () => void;
	getCalls: () => Array<{ method: string; args: any[] }>;
}

export function createMockDB(): MockDBFactory {
	let mockResult: any = [];
	let mockError: Error | null = null;
	const calls: Array<{ method: string; args: any[] }> = [];

	// Create a chainable object that tracks calls and resolves to mockResult
	const createChain = (methodName?: string, args?: any[]): MockChain => {
		if (methodName) {
			calls.push({ method: methodName, args: args || [] });
		}

		// The chain is PromiseLike, so await will resolve or reject
		const chain = {
			then: (resolve: (value: any) => any, reject?: (error: any) => any) =>
				mockError
					? Promise.reject(mockError).then(resolve, reject)
					: Promise.resolve(mockResult).then(resolve, reject),
			catch: (reject: (error: any) => any) =>
				mockError
					? Promise.reject(mockError).catch(reject)
					: Promise.resolve(mockResult).catch(reject),
			finally: (fn: () => void) =>
				mockError
					? Promise.reject(mockError).finally(fn)
					: Promise.resolve(mockResult).finally(fn)
		};

		// Proxy to make any method call continue the chain
		return new Proxy(chain as MockChain, {
			get(target, prop) {
				// Return existing promise methods
				if (prop in target) {
					return target[prop as keyof typeof target];
				}

				// Any other property returns a function that continues the chain
				return (...args: any[]) => createChain(String(prop), args);
			}
		});
	};

	// Create the main DB object with common methods
	const db = new Proxy({} as MockDB, {
		get(target, prop) {
			const propStr = String(prop);

			// Special handling for db.query.* (relational query API)
			if (propStr === 'query') {
				return new Proxy({}, {
					get(_, tableName) {
						return {
							findFirst: mock((...args: any[]) => {
								calls.push({ method: `query.${String(tableName)}.findFirst`, args });
								return mockError ? Promise.reject(mockError) : Promise.resolve(mockResult);
							}),
							findMany: mock((...args: any[]) => {
								calls.push({ method: `query.${String(tableName)}.findMany`, args });
								return mockError ? Promise.reject(mockError) : Promise.resolve(mockResult);
							})
						};
					}
				});
			}

			// Special handling for db.transaction(callback)
			if (propStr === 'transaction') {
				return async (callback: (tx: any) => Promise<any>) => {
					calls.push({ method: 'transaction', args: [] });
					return callback(db);
				};
			}

			// All other methods start a chain
			return (...args: any[]) => createChain(propStr, args);
		}
	});

	return {
		db,
		setResult: (result: any) => {
			mockResult = result;
			mockError = null;
		},
		setError: (error: Error) => {
			mockError = error;
			mockResult = [];
		},
		reset: () => {
			mockResult = [];
			mockError = null;
			calls.length = 0;
		},
		getCalls: () => [...calls]
	};
}

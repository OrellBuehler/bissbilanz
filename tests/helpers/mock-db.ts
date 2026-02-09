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
	[key: string]: AnyFunction;
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
	reset: () => void;
	getCalls: () => Array<{ method: string; args: any[] }>;
}

export function createMockDB(): MockDBFactory {
	let mockResult: any = [];
	const calls: Array<{ method: string; args: any[] }> = [];

	// Create a chainable object that tracks calls and resolves to mockResult
	const createChain = (methodName?: string, args?: any[]): MockChain => {
		if (methodName) {
			calls.push({ method: methodName, args: args || [] });
		}

		// The chain is PromiseLike, so await will resolve it
		const chain = {
			then: (resolve: (value: any) => any) => Promise.resolve(mockResult).then(resolve),
			catch: (reject: (error: any) => any) => Promise.resolve(mockResult).catch(reject),
			finally: (fn: () => void) => Promise.resolve(mockResult).finally(fn)
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
								return Promise.resolve(mockResult);
							}),
							findMany: mock((...args: any[]) => {
								calls.push({ method: `query.${String(tableName)}.findMany`, args });
								return Promise.resolve(mockResult);
							})
						};
					}
				});
			}

			// All other methods start a chain
			return (...args: any[]) => createChain(propStr, args);
		}
	});

	return {
		db,
		setResult: (result: any) => {
			mockResult = result;
		},
		reset: () => {
			mockResult = [];
			calls.length = 0;
		},
		getCalls: () => [...calls]
	};
}

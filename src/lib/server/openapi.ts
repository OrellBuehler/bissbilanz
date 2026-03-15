import 'zod-openapi';
import { createDocument } from 'zod-openapi';
import { z } from 'zod';
import { goalsSchema } from './validation/goals';
import { foodCreateSchema, foodUpdateSchema } from './validation/foods';
import { entryCreateSchema, entryUpdateSchema } from './validation/entries';
import { recipeCreateSchema, recipeUpdateSchema } from './validation/recipes';
import { supplementCreateSchema, supplementUpdateSchema } from './validation/supplements';
import { weightCreateSchema, weightUpdateSchema } from './validation/weight';
import { preferencesUpdateSchema } from './validation/preferences';
import { mealTypeCreateSchema, mealTypeUpdateSchema } from './validation/meal-types';
import {
	errorResponseSchema,
	validationErrorResponseSchema,
	conflictErrorResponseSchema
} from './validation/responses/shared';
import {
	foodsListResponseSchema,
	foodResponseSchema,
	foodsRecentResponseSchema
} from './validation/responses/foods';
import {
	entriesListResponseSchema,
	entryResponseSchema,
	entriesCopyResponseSchema,
	entriesRangeResponseSchema
} from './validation/responses/entries';
import { recipesListResponseSchema, recipeResponseSchema } from './validation/responses/recipes';
import {
	supplementsListResponseSchema,
	supplementResponseSchema,
	supplementChecklistResponseSchema,
	supplementLogResponseSchema,
	supplementHistoryResponseSchema
} from './validation/responses/supplements';
import {
	weightEntriesResponseSchema,
	weightEntryResponseSchema,
	weightLatestResponseSchema,
	weightTrendResponseSchema
} from './validation/responses/weight';
import {
	dailyStatsResponseSchema,
	weeklyStatsResponseSchema,
	monthlyStatsResponseSchema,
	mealBreakdownResponseSchema,
	topFoodsResponseSchema,
	streaksResponseSchema,
	calendarResponseSchema
} from './validation/responses/stats';
import { preferencesResponseSchema } from './validation/responses/preferences';
import {
	mealTypesListResponseSchema,
	mealTypeResponseSchema
} from './validation/responses/meal-types';
import { favoritesResponseSchema } from './validation/responses/favorites';
import { maintenanceResponseSchema } from './validation/responses/maintenance';
import { imageUploadResponseSchema } from './validation/responses/images';
import { openfoodfactsResponseSchema } from './validation/responses/openfoodfacts';

const goalsResponseSchema = z
	.object({
		goals: z
			.object({
				id: z.string().uuid(),
				userId: z.string().uuid(),
				calorieGoal: z.number(),
				proteinGoal: z.number(),
				carbGoal: z.number(),
				fatGoal: z.number(),
				fiberGoal: z.number(),
				sodiumGoal: z.number().nullable().optional(),
				sugarGoal: z.number().nullable().optional(),
				createdAt: z.string(),
				updatedAt: z.string()
			})
			.meta({ id: 'Goals' })
			.nullable()
	})
	.meta({ id: 'GoalsResponse' });

const goalsSetResponseSchema = z
	.object({
		goals: goalsResponseSchema.shape.goals.unwrap()
	})
	.meta({ id: 'GoalsSetResponse' });

const res401 = {
	'401': {
		description: 'Unauthorized',
		content: { 'application/json': { schema: errorResponseSchema } }
	}
} as const;

const res400 = {
	'400': {
		description: 'Validation error',
		content: { 'application/json': { schema: validationErrorResponseSchema } }
	}
} as const;

const res409 = {
	'409': {
		description: 'Conflict',
		content: { 'application/json': { schema: conflictErrorResponseSchema } }
	}
} as const;

const res204 = {
	'204': { description: 'Deleted' }
} as const;

export function generateSpec() {
	return createDocument({
		openapi: '3.1.0',
		info: {
			title: 'Bissbilanz API',
			version: '1.0.0',
			description: 'Food tracking application API'
		},
		servers: [{ url: '/' }],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: 'http',
					scheme: 'bearer',
					bearerFormat: 'JWT'
				}
			}
		},
		security: [{ bearerAuth: [] }],
		paths: {
			// ── Goals ─────────────────────────────────────────────
			'/api/goals': {
				get: {
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: goalsResponseSchema } }
						},
						...res401
					}
				},
				post: {
					requestBody: {
						content: { 'application/json': { schema: goalsSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: goalsSetResponseSchema } }
						},
						...res400,
						...res401
					}
				}
			},

			// ── Foods ─────────────────────────────────────────────
			'/api/foods': {
				get: {
					parameters: [
						{ name: 'search', in: 'query', schema: { type: 'string' }, required: false },
						{ name: 'barcode', in: 'query', schema: { type: 'string' }, required: false },
						{ name: 'limit', in: 'query', schema: { type: 'integer' }, required: false },
						{ name: 'offset', in: 'query', schema: { type: 'integer' }, required: false }
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: foodsListResponseSchema } }
						},
						...res401
					}
				},
				post: {
					requestBody: {
						content: { 'application/json': { schema: foodCreateSchema } }
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: foodResponseSchema } }
						},
						...res400,
						...res401
					}
				}
			},
			'/api/foods/recent': {
				get: {
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: foodsRecentResponseSchema } }
						},
						...res401
					}
				}
			},
			'/api/foods/{id}': {
				get: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: foodResponseSchema } }
						},
						...res401
					}
				},
				patch: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
					],
					requestBody: {
						content: { 'application/json': { schema: foodUpdateSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: foodResponseSchema } }
						},
						...res400,
						...res401
					}
				},
				delete: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
						{ name: 'force', in: 'query', schema: { type: 'boolean' }, required: false }
					],
					responses: {
						...res204,
						...res409,
						...res401
					}
				}
			},

			// ── Entries ───────────────────────────────────────────
			'/api/entries': {
				get: {
					parameters: [
						{
							name: 'date',
							in: 'query',
							required: true,
							schema: { type: 'string', format: 'date' }
						}
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: entriesListResponseSchema } }
						},
						...res401
					}
				},
				post: {
					requestBody: {
						content: { 'application/json': { schema: entryCreateSchema } }
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: entryResponseSchema } }
						},
						...res400,
						...res401
					}
				}
			},
			'/api/entries/copy': {
				post: {
					parameters: [
						{
							name: 'fromDate',
							in: 'query',
							required: true,
							schema: { type: 'string', format: 'date' }
						},
						{
							name: 'toDate',
							in: 'query',
							required: true,
							schema: { type: 'string', format: 'date' }
						}
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: entriesCopyResponseSchema } }
						},
						...res400,
						...res401
					}
				}
			},
			'/api/entries/range': {
				get: {
					parameters: [
						{
							name: 'startDate',
							in: 'query',
							required: true,
							schema: { type: 'string', format: 'date' }
						},
						{
							name: 'endDate',
							in: 'query',
							required: true,
							schema: { type: 'string', format: 'date' }
						}
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: entriesRangeResponseSchema } }
						},
						...res401
					}
				}
			},
			'/api/entries/{id}': {
				patch: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
					],
					requestBody: {
						content: { 'application/json': { schema: entryUpdateSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: entryResponseSchema } }
						},
						...res400,
						...res401
					}
				},
				delete: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
					],
					responses: {
						...res204,
						...res401
					}
				}
			},

			// ── Recipes ───────────────────────────────────────────
			'/api/recipes': {
				get: {
					parameters: [
						{ name: 'limit', in: 'query', schema: { type: 'integer' }, required: false },
						{ name: 'offset', in: 'query', schema: { type: 'integer' }, required: false }
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: recipesListResponseSchema } }
						},
						...res401
					}
				},
				post: {
					requestBody: {
						content: { 'application/json': { schema: recipeCreateSchema } }
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: recipeResponseSchema } }
						},
						...res400,
						...res401
					}
				}
			},
			'/api/recipes/{id}': {
				get: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: recipeResponseSchema } }
						},
						...res401
					}
				},
				patch: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
					],
					requestBody: {
						content: { 'application/json': { schema: recipeUpdateSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: recipeResponseSchema } }
						},
						...res400,
						...res401
					}
				},
				delete: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
					],
					responses: {
						...res204,
						...res409,
						...res401
					}
				}
			},

			// ── Supplements ───────────────────────────────────────
			'/api/supplements': {
				get: {
					parameters: [{ name: 'all', in: 'query', schema: { type: 'boolean' }, required: false }],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: supplementsListResponseSchema } }
						},
						...res401
					}
				},
				post: {
					requestBody: {
						content: { 'application/json': { schema: supplementCreateSchema } }
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: supplementResponseSchema } }
						},
						...res400,
						...res401
					}
				}
			},
			'/api/supplements/today': {
				get: {
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: supplementChecklistResponseSchema } }
						},
						...res401
					}
				}
			},
			'/api/supplements/history': {
				get: {
					parameters: [
						{
							name: 'from',
							in: 'query',
							schema: { type: 'string', format: 'date' },
							required: false
						},
						{ name: 'to', in: 'query', schema: { type: 'string', format: 'date' }, required: false }
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: supplementHistoryResponseSchema } }
						},
						...res401
					}
				}
			},
			'/api/supplements/{id}': {
				get: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: supplementResponseSchema } }
						},
						...res401
					}
				},
				patch: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
					],
					requestBody: {
						content: { 'application/json': { schema: supplementUpdateSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: supplementResponseSchema } }
						},
						...res400,
						...res401
					}
				},
				delete: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
					],
					responses: {
						...res204,
						...res401
					}
				}
			},
			'/api/supplements/{id}/log': {
				post: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
					],
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: supplementLogResponseSchema } }
						},
						...res401
					}
				}
			},
			'/api/supplements/{id}/log/{date}': {
				post: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
						{ name: 'date', in: 'path', required: true, schema: { type: 'string', format: 'date' } }
					],
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: supplementLogResponseSchema } }
						},
						...res401
					}
				},
				delete: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
						{ name: 'date', in: 'path', required: true, schema: { type: 'string', format: 'date' } }
					],
					responses: {
						...res204,
						...res401
					}
				}
			},
			'/api/supplements/{date}/checklist': {
				get: {
					parameters: [
						{ name: 'date', in: 'path', required: true, schema: { type: 'string', format: 'date' } }
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: supplementChecklistResponseSchema } }
						},
						...res401
					}
				}
			},

			// ── Weight ────────────────────────────────────────────
			'/api/weight': {
				get: {
					description:
						'Returns weight entries. When from/to query params are provided, returns trend data instead.',
					parameters: [
						{
							name: 'from',
							in: 'query',
							schema: { type: 'string', format: 'date' },
							required: false
						},
						{ name: 'to', in: 'query', schema: { type: 'string', format: 'date' }, required: false }
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: weightEntriesResponseSchema } }
						},
						...res401
					}
				},
				post: {
					requestBody: {
						content: { 'application/json': { schema: weightCreateSchema } }
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: weightEntryResponseSchema } }
						},
						...res400,
						...res401
					}
				}
			},
			'/api/weight/latest': {
				get: {
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: weightLatestResponseSchema } }
						},
						...res401
					}
				}
			},
			'/api/weight/{id}': {
				patch: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
					],
					requestBody: {
						content: { 'application/json': { schema: weightUpdateSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: weightEntryResponseSchema } }
						},
						...res400,
						...res401
					}
				},
				delete: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
					],
					responses: {
						...res204,
						...res401
					}
				}
			},

			// ── Stats ─────────────────────────────────────────────
			'/api/stats/daily': {
				get: {
					parameters: [
						{
							name: 'startDate',
							in: 'query',
							required: true,
							schema: { type: 'string', format: 'date' }
						},
						{
							name: 'endDate',
							in: 'query',
							required: true,
							schema: { type: 'string', format: 'date' }
						}
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: dailyStatsResponseSchema } }
						},
						...res401
					}
				}
			},
			'/api/stats/weekly': {
				get: {
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: weeklyStatsResponseSchema } }
						},
						...res401
					}
				}
			},
			'/api/stats/monthly': {
				get: {
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: monthlyStatsResponseSchema } }
						},
						...res401
					}
				}
			},
			'/api/stats/meal-breakdown': {
				get: {
					parameters: [
						{
							name: 'date',
							in: 'query',
							schema: { type: 'string', format: 'date' },
							required: false
						},
						{
							name: 'startDate',
							in: 'query',
							schema: { type: 'string', format: 'date' },
							required: false
						},
						{
							name: 'endDate',
							in: 'query',
							schema: { type: 'string', format: 'date' },
							required: false
						}
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: mealBreakdownResponseSchema } }
						},
						...res401
					}
				}
			},
			'/api/stats/top-foods': {
				get: {
					parameters: [
						{ name: 'days', in: 'query', schema: { type: 'integer' }, required: false },
						{ name: 'limit', in: 'query', schema: { type: 'integer' }, required: false }
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: topFoodsResponseSchema } }
						},
						...res401
					}
				}
			},
			'/api/stats/streaks': {
				get: {
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: streaksResponseSchema } }
						},
						...res401
					}
				}
			},
			'/api/stats/calendar': {
				get: {
					parameters: [{ name: 'month', in: 'query', required: true, schema: { type: 'string' } }],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: calendarResponseSchema } }
						},
						...res401
					}
				}
			},

			// ── Preferences ───────────────────────────────────────
			'/api/preferences': {
				get: {
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: preferencesResponseSchema } }
						},
						...res401
					}
				},
				patch: {
					requestBody: {
						content: { 'application/json': { schema: preferencesUpdateSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: preferencesResponseSchema } }
						},
						...res400,
						...res401
					}
				}
			},

			// ── Meal Types ────────────────────────────────────────
			'/api/meal-types': {
				get: {
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: mealTypesListResponseSchema } }
						},
						...res401
					}
				},
				post: {
					requestBody: {
						content: { 'application/json': { schema: mealTypeCreateSchema } }
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: mealTypeResponseSchema } }
						},
						...res400,
						...res401
					}
				}
			},
			'/api/meal-types/{id}': {
				patch: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
					],
					requestBody: {
						content: { 'application/json': { schema: mealTypeUpdateSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: mealTypeResponseSchema } }
						},
						...res400,
						...res401
					}
				},
				delete: {
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
					],
					responses: {
						...res204,
						...res401
					}
				}
			},

			// ── Favorites ─────────────────────────────────────────
			'/api/favorites': {
				get: {
					parameters: [
						{
							name: 'type',
							in: 'query',
							schema: { type: 'string', enum: ['foods', 'recipes'] },
							required: false
						}
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: favoritesResponseSchema } }
						},
						...res401
					}
				}
			},

			// ── Maintenance ───────────────────────────────────────
			'/api/maintenance': {
				get: {
					parameters: [
						{
							name: 'startDate',
							in: 'query',
							required: true,
							schema: { type: 'string', format: 'date' }
						},
						{
							name: 'endDate',
							in: 'query',
							required: true,
							schema: { type: 'string', format: 'date' }
						},
						{ name: 'muscleRatio', in: 'query', schema: { type: 'number' }, required: false }
					],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: maintenanceResponseSchema } }
						},
						...res400,
						...res401
					}
				}
			},

			// ── Images ────────────────────────────────────────────
			'/api/images/upload': {
				post: {
					requestBody: {
						content: {
							'multipart/form-data': {
								schema: {
									type: 'object' as const,
									properties: {
										file: { type: 'string' as const, format: 'binary' }
									},
									required: ['file']
								}
							}
						}
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: imageUploadResponseSchema } }
						},
						...res400,
						...res401
					}
				}
			},

			// ── Open Food Facts ───────────────────────────────────
			'/api/openfoodfacts/{barcode}': {
				get: {
					parameters: [{ name: 'barcode', in: 'path', required: true, schema: { type: 'string' } }],
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: openfoodfactsResponseSchema } }
						},
						...res401
					}
				}
			}
		}
	});
}

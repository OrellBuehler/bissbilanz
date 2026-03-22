import { createDocument, type ZodOpenApiResponseObject } from 'zod-openapi';
import { z } from 'zod';
import { goalsSchema } from './validation/goals';
import { foodCreateSchema, foodUpdateSchema } from './validation/foods';
import { entryCreateSchema, entryUpdateSchema } from './validation/entries';
import { recipeCreateSchema, recipeUpdateSchema } from './validation/recipes';
import {
	supplementCreateSchema,
	supplementUpdateSchema,
	supplementLogSchema
} from './validation/supplements';
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
import { goalsResponseSchema, goalsSetResponseSchema } from './validation/responses/goals';
import {
	dayPropertiesResponseSchema,
	dayPropertiesRangeResponseSchema
} from './validation/responses/day-properties';
import { dayPropertiesSetSchema } from './validation/day-properties';
import { sleepCreateSchema, sleepUpdateSchema } from './validation/sleep';
import { sleepEntriesResponseSchema, sleepEntryResponseSchema } from './validation/responses/sleep';
import { sleepFoodCorrelationResponseSchema } from './validation/responses/analytics';
import { analyticsDateRangeSchema } from './validation/analytics';

const uuidPathId = z.object({ id: z.string().uuid() });

const res401: ZodOpenApiResponseObject = {
	id: 'UnauthorizedResponse',
	description: 'Unauthorized',
	content: { 'application/json': { schema: errorResponseSchema } }
};

const res400: ZodOpenApiResponseObject = {
	id: 'ValidationErrorResponse',
	description: 'Validation error',
	content: { 'application/json': { schema: validationErrorResponseSchema } }
};

const res409: ZodOpenApiResponseObject = {
	id: 'ConflictResponse',
	description: 'Conflict',
	content: { 'application/json': { schema: conflictErrorResponseSchema } }
};

const res204: ZodOpenApiResponseObject = {
	id: 'DeletedResponse',
	description: 'Deleted'
};

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
					operationId: 'getGoals',
					tags: ['Goals'],
					description: 'Get daily nutrition goals.',
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: goalsResponseSchema } }
						},
						'401': res401
					}
				},
				post: {
					operationId: 'setGoals',
					tags: ['Goals'],
					description: 'Set daily nutrition goals.',
					requestBody: {
						required: true,
						content: { 'application/json': { schema: goalsSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: goalsSetResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				}
			},

			// ── Foods ─────────────────────────────────────────────
			'/api/foods': {
				get: {
					operationId: 'listFoods',
					tags: ['Foods'],
					description: 'Search or list foods in the personal database.',
					requestParams: {
						query: z.object({
							q: z.string().optional(),
							barcode: z.string().optional(),
							limit: z.number().int().optional(),
							offset: z.number().int().optional()
						})
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: foodsListResponseSchema } }
						},
						'401': res401
					}
				},
				post: {
					operationId: 'createFood',
					tags: ['Foods'],
					description: 'Create a new food in the personal database.',
					requestBody: {
						required: true,
						content: { 'application/json': { schema: foodCreateSchema } }
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: foodResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				}
			},
			'/api/foods/recent': {
				get: {
					operationId: 'listRecentFoods',
					tags: ['Foods'],
					description: 'List recently logged foods.',
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: foodsRecentResponseSchema } }
						},
						'401': res401
					}
				}
			},
			'/api/foods/{id}': {
				get: {
					operationId: 'getFood',
					tags: ['Foods'],
					description: 'Get a single food by ID.',
					requestParams: { path: uuidPathId },
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: foodResponseSchema } }
						},
						'401': res401
					}
				},
				patch: {
					operationId: 'updateFood',
					tags: ['Foods'],
					description: 'Update a food in the personal database.',
					requestParams: { path: uuidPathId },
					requestBody: {
						required: true,
						content: { 'application/json': { schema: foodUpdateSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: foodResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				},
				delete: {
					operationId: 'deleteFood',
					tags: ['Foods'],
					description:
						'Delete a food. Pass force=true to delete even if diary entries reference it.',
					requestParams: {
						path: uuidPathId,
						query: z.object({ force: z.boolean().optional() })
					},
					responses: {
						'204': res204,
						'401': res401,
						'409': res409
					}
				}
			},

			// ── Entries ───────────────────────────────────────────
			'/api/entries': {
				get: {
					operationId: 'listEntries',
					tags: ['Entries'],
					description: 'List diary entries for a given date.',
					requestParams: {
						query: z.object({ date: z.string().date() })
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: entriesListResponseSchema } }
						},
						'401': res401
					}
				},
				post: {
					operationId: 'createEntry',
					tags: ['Entries'],
					description: 'Log a food entry.',
					requestBody: {
						required: true,
						content: { 'application/json': { schema: entryCreateSchema } }
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: entryResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				}
			},
			'/api/entries/copy': {
				post: {
					operationId: 'copyEntries',
					tags: ['Entries'],
					description: 'Copy all diary entries from one date to another.',
					requestParams: {
						query: z.object({
							fromDate: z.string().date(),
							toDate: z.string().date()
						})
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: entriesCopyResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				}
			},
			'/api/entries/range': {
				get: {
					operationId: 'getEntriesRange',
					tags: ['Entries'],
					description: 'Get diary entries for a date range.',
					requestParams: {
						query: z.object({
							startDate: z.string().date(),
							endDate: z.string().date()
						})
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: entriesRangeResponseSchema } }
						},
						'401': res401
					}
				}
			},
			'/api/entries/{id}': {
				patch: {
					operationId: 'updateEntry',
					tags: ['Entries'],
					description: 'Update a diary entry.',
					requestParams: { path: uuidPathId },
					requestBody: {
						required: true,
						content: { 'application/json': { schema: entryUpdateSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: entryResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				},
				delete: {
					operationId: 'deleteEntry',
					tags: ['Entries'],
					description: 'Delete a diary entry.',
					requestParams: { path: uuidPathId },
					responses: {
						'204': res204,
						'401': res401
					}
				}
			},

			// ── Recipes ───────────────────────────────────────────
			'/api/recipes': {
				get: {
					operationId: 'listRecipes',
					tags: ['Recipes'],
					description: 'List recipes.',
					requestParams: {
						query: z.object({
							limit: z.number().int().optional(),
							offset: z.number().int().optional()
						})
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: recipesListResponseSchema } }
						},
						'401': res401
					}
				},
				post: {
					operationId: 'createRecipe',
					tags: ['Recipes'],
					description: 'Create a new recipe.',
					requestBody: {
						required: true,
						content: { 'application/json': { schema: recipeCreateSchema } }
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: recipeResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				}
			},
			'/api/recipes/{id}': {
				get: {
					operationId: 'getRecipe',
					tags: ['Recipes'],
					description: 'Get a single recipe by ID.',
					requestParams: { path: uuidPathId },
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: recipeResponseSchema } }
						},
						'401': res401
					}
				},
				patch: {
					operationId: 'updateRecipe',
					tags: ['Recipes'],
					description: 'Update a recipe.',
					requestParams: { path: uuidPathId },
					requestBody: {
						required: true,
						content: { 'application/json': { schema: recipeUpdateSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: recipeResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				},
				delete: {
					operationId: 'deleteRecipe',
					tags: ['Recipes'],
					description:
						'Delete a recipe. Pass force=true to delete even if diary entries reference it.',
					requestParams: {
						path: uuidPathId,
						query: z.object({ force: z.boolean().optional() })
					},
					responses: {
						'204': res204,
						'401': res401,
						'409': res409
					}
				}
			},

			// ── Supplements ───────────────────────────────────────
			'/api/supplements': {
				get: {
					operationId: 'listSupplements',
					tags: ['Supplements'],
					description: 'List supplements. Pass all=true to include inactive ones.',
					requestParams: {
						query: z.object({ all: z.boolean().optional() })
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: supplementsListResponseSchema } }
						},
						'401': res401
					}
				},
				post: {
					operationId: 'createSupplement',
					tags: ['Supplements'],
					description: 'Create a new supplement.',
					requestBody: {
						required: true,
						content: { 'application/json': { schema: supplementCreateSchema } }
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: supplementResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				}
			},
			'/api/supplements/today': {
				get: {
					operationId: 'getTodaySupplementChecklist',
					tags: ['Supplements'],
					description: "Get today's supplement checklist.",
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: supplementChecklistResponseSchema } }
						},
						'401': res401
					}
				}
			},
			'/api/supplements/history': {
				get: {
					operationId: 'getSupplementHistory',
					tags: ['Supplements'],
					description: 'Get supplement log history.',
					requestParams: {
						query: z.object({
							from: z.string().date().optional(),
							to: z.string().date().optional()
						})
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: supplementHistoryResponseSchema } }
						},
						'401': res401
					}
				}
			},
			'/api/supplements/{id}': {
				get: {
					operationId: 'getSupplement',
					tags: ['Supplements'],
					description: 'Get a single supplement by ID.',
					requestParams: { path: uuidPathId },
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: supplementResponseSchema } }
						},
						'401': res401
					}
				},
				patch: {
					operationId: 'updateSupplement',
					tags: ['Supplements'],
					description: 'Update a supplement.',
					requestParams: { path: uuidPathId },
					requestBody: {
						required: true,
						content: { 'application/json': { schema: supplementUpdateSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: supplementResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				},
				delete: {
					operationId: 'deleteSupplement',
					tags: ['Supplements'],
					description: 'Delete a supplement.',
					requestParams: { path: uuidPathId },
					responses: {
						'204': res204,
						'401': res401
					}
				}
			},
			'/api/supplements/{id}/log': {
				post: {
					operationId: 'logSupplement',
					tags: ['Supplements'],
					description: 'Log a supplement as taken today.',
					requestParams: { path: uuidPathId },
					requestBody: {
						required: true,
						content: { 'application/json': { schema: supplementLogSchema } }
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: supplementLogResponseSchema } }
						},
						'401': res401
					}
				}
			},
			'/api/supplements/{id}/log/{date}': {
				delete: {
					operationId: 'unlogSupplementForDate',
					tags: ['Supplements'],
					description: 'Remove a supplement log entry for a specific date.',
					requestParams: {
						path: z.object({ id: z.string().uuid(), date: z.string().date() })
					},
					responses: {
						'204': res204,
						'401': res401
					}
				}
			},
			'/api/supplements/{date}/checklist': {
				get: {
					operationId: 'getSupplementChecklist',
					tags: ['Supplements'],
					description: 'Get supplement checklist for a specific date.',
					requestParams: {
						path: z.object({ date: z.string().date() })
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: supplementChecklistResponseSchema } }
						},
						'401': res401
					}
				}
			},

			// ── Weight ────────────────────────────────────────────
			'/api/weight': {
				get: {
					operationId: 'listWeightEntries',
					tags: ['Weight'],
					description:
						'Returns weight entries. When from/to query params are provided, returns trend data instead.',
					requestParams: {
						query: z.object({
							from: z.string().date().optional(),
							to: z.string().date().optional()
						})
					},
					responses: {
						'200': {
							description: 'Weight entries or trend data',
							content: {
								'application/json': {
									schema: z.union([weightEntriesResponseSchema, weightTrendResponseSchema])
								}
							}
						},
						'401': res401
					}
				},
				post: {
					operationId: 'createWeightEntry',
					tags: ['Weight'],
					description: 'Log a new weight measurement.',
					requestBody: {
						required: true,
						content: { 'application/json': { schema: weightCreateSchema } }
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: weightEntryResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				}
			},
			'/api/weight/latest': {
				get: {
					operationId: 'getLatestWeight',
					tags: ['Weight'],
					description: 'Get the most recent weight entry.',
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: weightLatestResponseSchema } }
						},
						'401': res401
					}
				}
			},
			'/api/weight/{id}': {
				patch: {
					operationId: 'updateWeightEntry',
					tags: ['Weight'],
					description: 'Update a weight entry.',
					requestParams: { path: uuidPathId },
					requestBody: {
						required: true,
						content: { 'application/json': { schema: weightUpdateSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: weightEntryResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				},
				delete: {
					operationId: 'deleteWeightEntry',
					tags: ['Weight'],
					description: 'Delete a weight entry.',
					requestParams: { path: uuidPathId },
					responses: {
						'204': res204,
						'401': res401
					}
				}
			},

			// ── Stats ─────────────────────────────────────────────
			'/api/stats/daily': {
				get: {
					operationId: 'getDailyStats',
					tags: ['Stats'],
					description: 'Get daily nutrition totals for a date range.',
					requestParams: {
						query: z.object({
							startDate: z.string().date(),
							endDate: z.string().date()
						})
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: dailyStatsResponseSchema } }
						},
						'401': res401
					}
				}
			},
			'/api/stats/weekly': {
				get: {
					operationId: 'getWeeklyStats',
					tags: ['Stats'],
					description: 'Get average daily nutrition over the past 7 days.',
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: weeklyStatsResponseSchema } }
						},
						'401': res401
					}
				}
			},
			'/api/stats/monthly': {
				get: {
					operationId: 'getMonthlyStats',
					tags: ['Stats'],
					description: 'Get average daily nutrition over the past 30 days.',
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: monthlyStatsResponseSchema } }
						},
						'401': res401
					}
				}
			},
			'/api/stats/meal-breakdown': {
				get: {
					operationId: 'getMealBreakdown',
					tags: ['Stats'],
					description: 'Get nutrition totals broken down by meal type.',
					requestParams: {
						query: z.object({
							date: z.string().date().optional(),
							startDate: z.string().date().optional(),
							endDate: z.string().date().optional()
						})
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: mealBreakdownResponseSchema } }
						},
						'401': res401
					}
				}
			},
			'/api/stats/top-foods': {
				get: {
					operationId: 'getTopFoods',
					tags: ['Stats'],
					description: 'Get most frequently logged foods.',
					requestParams: {
						query: z.object({
							days: z.number().int().optional(),
							limit: z.number().int().optional()
						})
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: topFoodsResponseSchema } }
						},
						'401': res401
					}
				}
			},
			'/api/stats/streaks': {
				get: {
					operationId: 'getStreaks',
					tags: ['Stats'],
					description: 'Get current and longest logging streaks.',
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: streaksResponseSchema } }
						},
						'401': res401
					}
				}
			},
			'/api/stats/calendar': {
				get: {
					operationId: 'getCalendar',
					tags: ['Stats'],
					description: 'Get calendar view of logged days for a month.',
					requestParams: {
						query: z.object({ month: z.string() })
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: calendarResponseSchema } }
						},
						'401': res401
					}
				}
			},

			// ── Day Properties ────────────────────────────────────
			'/api/day-properties': {
				get: {
					operationId: 'getDayProperties',
					tags: ['DayProperties'],
					description:
						'Get day properties for a single date or a date range. Use date for single day, startDate/endDate for range.',
					requestParams: {
						query: z.object({
							date: z.string().date().optional(),
							startDate: z.string().date().optional(),
							endDate: z.string().date().optional()
						})
					},
					responses: {
						'200': {
							description: 'Day properties or range of day properties',
							content: {
								'application/json': {
									schema: z.union([dayPropertiesResponseSchema, dayPropertiesRangeResponseSchema])
								}
							}
						},
						'401': res401
					}
				},
				put: {
					operationId: 'setDayProperties',
					tags: ['DayProperties'],
					description: 'Set day properties (e.g. mark as fasting day).',
					requestBody: {
						required: true,
						content: { 'application/json': { schema: dayPropertiesSetSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: dayPropertiesResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				},
				delete: {
					operationId: 'deleteDayProperties',
					tags: ['DayProperties'],
					description: 'Delete day properties for a specific date.',
					requestParams: {
						query: z.object({ date: z.string().date() })
					},
					responses: {
						'204': res204,
						'401': res401
					}
				}
			},

			// ── Preferences ───────────────────────────────────────
			'/api/preferences': {
				get: {
					operationId: 'getPreferences',
					tags: ['Preferences'],
					description: 'Get user preferences.',
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: preferencesResponseSchema } }
						},
						'401': res401
					}
				},
				patch: {
					operationId: 'updatePreferences',
					tags: ['Preferences'],
					description: 'Update user preferences.',
					requestBody: {
						required: true,
						content: { 'application/json': { schema: preferencesUpdateSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: preferencesResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				}
			},

			// ── Meal Types ────────────────────────────────────────
			'/api/meal-types': {
				get: {
					operationId: 'listMealTypes',
					tags: ['MealTypes'],
					description: 'List meal types.',
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: mealTypesListResponseSchema } }
						},
						'401': res401
					}
				},
				post: {
					operationId: 'createMealType',
					tags: ['MealTypes'],
					description: 'Create a new meal type.',
					requestBody: {
						required: true,
						content: { 'application/json': { schema: mealTypeCreateSchema } }
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: mealTypeResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				}
			},
			'/api/meal-types/{id}': {
				patch: {
					operationId: 'updateMealType',
					tags: ['MealTypes'],
					description: 'Update a meal type.',
					requestParams: { path: uuidPathId },
					requestBody: {
						required: true,
						content: { 'application/json': { schema: mealTypeUpdateSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: mealTypeResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				},
				delete: {
					operationId: 'deleteMealType',
					tags: ['MealTypes'],
					description: 'Delete a meal type.',
					requestParams: { path: uuidPathId },
					responses: {
						'204': res204,
						'401': res401
					}
				}
			},

			// ── Favorites ─────────────────────────────────────────
			'/api/favorites': {
				get: {
					operationId: 'listFavorites',
					tags: ['Favorites'],
					description: 'List favorite foods and recipes.',
					requestParams: {
						query: z.object({
							type: z.enum(['foods', 'recipes']).optional()
						})
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: favoritesResponseSchema } }
						},
						'401': res401
					}
				}
			},

			// ── Maintenance ───────────────────────────────────────
			'/api/maintenance': {
				get: {
					operationId: 'getMaintenance',
					tags: ['Maintenance'],
					description: 'Calculate maintenance calories for a date range.',
					requestParams: {
						query: z.object({
							startDate: z.string().date(),
							endDate: z.string().date(),
							muscleRatio: z.number().optional()
						})
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: maintenanceResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				}
			},

			// ── Images ────────────────────────────────────────────
			'/api/images/upload': {
				post: {
					operationId: 'uploadImage',
					tags: ['Images'],
					description: 'Upload an image file.',
					requestBody: {
						required: true,
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
						'400': res400,
						'401': res401
					}
				}
			},

			// ── Sleep ─────────────────────────────────────────────
			'/api/sleep': {
				get: {
					operationId: 'listSleepEntries',
					tags: ['Sleep'],
					description: 'List sleep entries, optionally filtered by date range.',
					requestParams: {
						query: z.object({
							from: z.string().date().optional(),
							to: z.string().date().optional()
						})
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: sleepEntriesResponseSchema } }
						},
						'401': res401
					}
				},
				post: {
					operationId: 'createSleepEntry',
					tags: ['Sleep'],
					description: 'Create a new sleep entry.',
					requestBody: {
						required: true,
						content: { 'application/json': { schema: sleepCreateSchema } }
					},
					responses: {
						'201': {
							description: 'Created',
							content: { 'application/json': { schema: sleepEntryResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				}
			},
			'/api/sleep/{id}': {
				patch: {
					operationId: 'updateSleepEntry',
					tags: ['Sleep'],
					description: 'Update a sleep entry.',
					requestParams: { path: uuidPathId },
					requestBody: {
						required: true,
						content: { 'application/json': { schema: sleepUpdateSchema } }
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: sleepEntryResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				},
				delete: {
					operationId: 'deleteSleepEntry',
					tags: ['Sleep'],
					description: 'Delete a sleep entry.',
					requestParams: { path: uuidPathId },
					responses: {
						'204': res204,
						'401': res401
					}
				}
			},

			// ── Analytics ─────────────────────────────────────────
			'/api/analytics/sleep-food': {
				get: {
					operationId: 'getSleepFoodCorrelation',
					tags: ['Analytics'],
					description: 'Get sleep-food correlation data for a date range.',
					requestParams: {
						query: z.object({
							startDate: z.string().date(),
							endDate: z.string().date()
						})
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: sleepFoodCorrelationResponseSchema } }
						},
						'400': res400,
						'401': res401
					}
				}
			},

			// ── Open Food Facts ───────────────────────────────────
			'/api/openfoodfacts/{barcode}': {
				get: {
					operationId: 'lookupOpenFoodFacts',
					tags: ['OpenFoodFacts'],
					description: 'Look up a product by barcode in Open Food Facts.',
					requestParams: {
						path: z.object({ barcode: z.string() })
					},
					responses: {
						'200': {
							description: 'Success',
							content: { 'application/json': { schema: openfoodfactsResponseSchema } }
						},
						'401': res401
					}
				}
			}
		}
	});
}

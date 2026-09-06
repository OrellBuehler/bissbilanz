import { z } from 'zod';
import { importFormatSchema, importModeSchema } from '../import';

export const importSummaryResponseSchema = z
	.object({
		mode: importModeSchema,
		format: importFormatSchema,
		totalRows: z.number(),
		imported: z.number(),
		skipped: z.number(),
		sections: z.array(
			z
				.object({
					name: z.string(),
					toImport: z.number(),
					skipped: z.number()
				})
				.meta({ id: 'ImportSection' })
		),
		samples: z.array(z.string()),
		issues: z.array(
			z
				.object({
					row: z.number(),
					message: z.string()
				})
				.meta({ id: 'ImportIssue' })
		)
	})
	.meta({ id: 'ImportSummaryResponse' });

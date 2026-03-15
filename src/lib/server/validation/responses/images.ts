import 'zod-openapi';
import { z } from 'zod';

export const imageUploadResponseSchema = z
	.object({
		imageUrl: z.string()
	})
	.meta({ id: 'ImageUploadResponse' });

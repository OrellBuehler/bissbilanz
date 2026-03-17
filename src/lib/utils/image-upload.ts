import { apiFetch } from '$lib/utils/api';
import { api } from '$lib/api/client';
import { toast } from 'svelte-sonner';
import * as Sentry from '@sentry/sveltekit';
import * as m from '$lib/paraglide/messages';

type UploadTarget = { type: 'food'; id: string } | { type: 'recipe'; id: string };

export async function uploadImage(file: File, target: UploadTarget): Promise<string | null> {
	const formData = new FormData();
	formData.append('image', file);

	try {
		const uploadRes = await apiFetch('/api/images/upload', {
			method: 'POST',
			body: formData
		});
		if (!uploadRes.ok) {
			const body = await uploadRes.text().catch(() => '');
			Sentry.logger.error('Image upload failed', {
				status: uploadRes.status,
				body: body.slice(0, 500),
				fileSize: file.size,
				fileType: file.type,
				context: `${target.type}-edit`
			});
			toast.error(m.image_upload_failed());
			return null;
		}
		const { imageUrl } = await uploadRes.json();

		const { error } =
			target.type === 'food'
				? await api.PATCH('/api/foods/{id}', {
						params: { path: { id: target.id } },
						body: { imageUrl }
					})
				: await api.PATCH('/api/recipes/{id}', {
						params: { path: { id: target.id } },
						body: { imageUrl }
					});

		if (error) {
			Sentry.logger.error('Image URL save failed', {
				targetType: target.type,
				targetId: target.id,
				error: JSON.stringify(error)
			});
			toast.error(m.image_upload_failed());
			return null;
		}

		toast.success(m.image_uploaded());
		return imageUrl;
	} catch (err) {
		Sentry.captureException(err, { extra: { fileSize: file.size, fileType: file.type } });
		toast.error(m.image_upload_failed());
		return null;
	}
}

import { apiFetch } from '$lib/utils/api';
import { api } from '$lib/api/client';
import { toast } from 'svelte-sonner';
import * as Sentry from '@sentry/sveltekit';
import * as m from '$lib/paraglide/messages';

type UploadTarget = { type: 'food'; id: string } | { type: 'recipe'; id: string };

/**
 * Store the bytes and return the `/uploads/...` URL without attaching it to
 * anything. A create flow has no row to PATCH yet, so it carries the URL in the
 * create body instead; an abandoned upload is collected by the orphan sweep.
 */
export async function uploadImageFile(file: File, context = 'create'): Promise<string | null> {
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
				context
			});
			toast.error(m.image_upload_failed());
			return null;
		}
		const { imageUrl } = await uploadRes.json();
		return imageUrl as string;
	} catch (err) {
		Sentry.captureException(err, { extra: { fileSize: file.size, fileType: file.type } });
		toast.error(m.image_upload_failed());
		return null;
	}
}

export async function uploadImage(file: File, target: UploadTarget): Promise<string | null> {
	const imageUrl = await uploadImageFile(file, `${target.type}-edit`);
	if (!imageUrl) return null;

	try {
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
		Sentry.captureException(err, { extra: { targetType: target.type, targetId: target.id } });
		toast.error(m.image_upload_failed());
		return null;
	}
}

/**
 * Detach the image from an existing food or recipe. The bytes stay on disk
 * until the orphan sweep collects them, so this is a plain `imageUrl: null`
 * PATCH — the same shape `uploadImage` uses to attach one.
 */
export async function removeImage(target: UploadTarget): Promise<boolean> {
	try {
		const { error } =
			target.type === 'food'
				? await api.PATCH('/api/foods/{id}', {
						params: { path: { id: target.id } },
						body: { imageUrl: null }
					})
				: await api.PATCH('/api/recipes/{id}', {
						params: { path: { id: target.id } },
						body: { imageUrl: null }
					});

		if (error) {
			Sentry.logger.error('Image removal failed', {
				targetType: target.type,
				targetId: target.id,
				error: JSON.stringify(error)
			});
			toast.error(m.image_remove_failed());
			return false;
		}

		toast.success(m.image_removed());
		return true;
	} catch (err) {
		Sentry.captureException(err, { extra: { targetType: target.type, targetId: target.id } });
		toast.error(m.image_remove_failed());
		return false;
	}
}

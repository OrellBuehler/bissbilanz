import * as Sentry from '@sentry/sveltekit';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { UPLOAD_DIR, UPLOAD_FILENAME_PATTERN, ownsUpload } from '../../images';

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

async function loadPhoto(userId: string, photoUrl: string): Promise<string | null> {
	const filename = photoUrl.replace(/^\/uploads\//, '');
	if (!UPLOAD_FILENAME_PATTERN.test(filename)) return null;
	if (!(await ownsUpload(userId, filename))) return null;
	const path = join(UPLOAD_DIR, filename);
	try {
		const { size } = await stat(path);
		if (size > MAX_PHOTO_BYTES) return null;
		return (await readFile(path)).toString('base64');
	} catch (error) {
		Sentry.captureException(error, { level: 'warning', tags: { source: 'claude-photos' } });
		return null;
	}
}

export async function loadTaskPhotos(
	userId: string,
	photoUrls: string[] | null
): Promise<(string | null)[]> {
	return Promise.all((photoUrls ?? []).map((url) => loadPhoto(userId, url)));
}

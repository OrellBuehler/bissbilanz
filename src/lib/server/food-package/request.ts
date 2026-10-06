import { ApiError } from '$lib/server/errors';
import { readCappedFormData } from '$lib/server/upload';
import { readFoodPackage, type FoodPackageFile } from './archive';
import { MAX_PACKAGE_BYTES, packageTooLarge } from './format';

/** Read the multipart `file` part of a package upload, rejecting oversized bodies early. */
export async function readPackageUpload(
	request: Request
): Promise<{ pkg: FoodPackageFile; form: FormData }> {
	const contentLength = Number(request.headers.get('content-length') ?? 0);
	if (contentLength > MAX_PACKAGE_BYTES + 64 * 1024) throw packageTooLarge();
	const form = await readCappedFormData(request, MAX_PACKAGE_BYTES, packageTooLarge);
	const file = form.get('file');
	if (!file || !(file instanceof File)) throw new ApiError(400, 'Missing package file');
	if (file.size > MAX_PACKAGE_BYTES) throw packageTooLarge();
	const pkg = readFoodPackage(new Uint8Array(await file.arrayBuffer()));
	return { pkg, form };
}

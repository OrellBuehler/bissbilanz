import { ApiError } from '$lib/server/errors';
import { readFoodPackage, type FoodPackageFile } from './archive';
import { MAX_PACKAGE_BYTES } from './format';

/** Read the multipart `file` part of a package upload, rejecting oversized bodies early. */
export async function readPackageUpload(
	request: Request
): Promise<{ pkg: FoodPackageFile; form: FormData }> {
	const contentLength = Number(request.headers.get('content-length') ?? 0);
	if (contentLength > MAX_PACKAGE_BYTES + 64 * 1024) {
		throw new ApiError(400, `File must be ${MAX_PACKAGE_BYTES / 1024 / 1024}MB or smaller`);
	}
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		throw new ApiError(400, 'Expected a multipart/form-data upload');
	}
	const file = form.get('file');
	if (!file || !(file instanceof File)) throw new ApiError(400, 'Missing package file');
	if (file.size > MAX_PACKAGE_BYTES) {
		throw new ApiError(400, `File must be ${MAX_PACKAGE_BYTES / 1024 / 1024}MB or smaller`);
	}
	const pkg = readFoodPackage(new Uint8Array(await file.arrayBuffer()));
	return { pkg, form };
}

import { datasetProductSchema, type DatasetProduct } from '$lib/server/catalog/dataset-schema';

export type DatasetHeaderInput = {
	key: string;
	name: string;
	source: 'migros' | 'off' | 'coop';
	priority: number;
	version?: string;
};

export class DatasetWriter {
	#path: string;
	#header: DatasetHeaderInput;
	#snapshotAt: string;
	#sink: Bun.FileSink | null = null;
	#count = 0;

	constructor(path: string, header: DatasetHeaderInput, snapshotAt = new Date().toISOString()) {
		this.#path = path;
		this.#header = header;
		this.#snapshotAt = snapshotAt;
	}

	async open(): Promise<void> {
		this.#sink = Bun.file(this.#path).writer();
		const headerLine = JSON.stringify({
			_dataset: {
				key: this.#header.key,
				name: this.#header.name,
				source: this.#header.source,
				priority: this.#header.priority,
				version: this.#header.version ?? null,
				snapshotAt: this.#snapshotAt
			}
		});
		this.#sink.write(headerLine + '\n');
	}

	async write(product: DatasetProduct): Promise<void> {
		if (!this.#sink) throw new Error('DatasetWriter.open() not called');
		// fail-closed: never write a line the importer would reject
		const parsed = datasetProductSchema.safeParse(product);
		if (!parsed.success) throw new Error(`invalid product: ${parsed.error.issues[0]?.message}`);
		this.#sink.write(JSON.stringify(product) + '\n');
		this.#count++;
	}

	async close(): Promise<number> {
		if (this.#sink) await this.#sink.end();
		this.#sink = null;
		return this.#count;
	}
}

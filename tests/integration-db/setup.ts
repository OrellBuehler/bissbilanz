import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Wait } from 'testcontainers';

let container: StartedPostgreSqlContainer;

export async function setup() {
	process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';
	process.env.TESTCONTAINERS_HOST_OVERRIDE = 'localhost';
	container = await new PostgreSqlContainer('postgres:18')
		.withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
		.start();
	process.env.TEST_DATABASE_URL = container.getConnectionUri();
}

export async function teardown() {
	await container?.stop();
}

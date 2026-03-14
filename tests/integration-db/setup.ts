import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Wait } from 'testcontainers';

let container: StartedPostgreSqlContainer;

const isWSL = !!process.env.WSL_DISTRO_NAME;

export async function setup() {
	// Ryuk (resource reaper) fails to connect across WSL2 distros.
	// Safe to disable on CI too since runners are ephemeral.
	process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';

	const pg = new PostgreSqlContainer('postgres:18');

	if (isWSL) {
		// WSL2 + Docker Desktop: container ports bind on the Docker VM,
		// not on the WSL2 distro. Override host to localhost (Docker Desktop
		// forwards ports there) and use log-based wait since the default
		// port-check wait can't reach the container.
		process.env.TESTCONTAINERS_HOST_OVERRIDE = 'localhost';
		pg.withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2));
	}

	container = await pg.start();
	process.env.TEST_DATABASE_URL = container.getConnectionUri();
}

export async function teardown() {
	await container?.stop();
}

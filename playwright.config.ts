import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.e2e.ts',
	globalSetup: './tests/e2e/global-setup.ts',
	reporter: process.env.CI
		? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
		: [['list'], ['html', { open: 'on-failure' }]],
	use: {
		baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:4000',
		storageState: 'tests/e2e/.auth/session.json'
	},
	webServer: process.env.CI
		? {
				command: 'bun build/index.js',
				port: 4000,
				timeout: 30_000,
				reuseExistingServer: false,
				env: {
					DATABASE_URL: process.env.DATABASE_URL ?? '',
					SESSION_SECRET: process.env.SESSION_SECRET ?? '',
					PUBLIC_APP_URL: 'http://localhost:4000',
					INFOMANIAK_CLIENT_ID: process.env.INFOMANIAK_CLIENT_ID ?? 'fake',
					INFOMANIAK_CLIENT_SECRET: process.env.INFOMANIAK_CLIENT_SECRET ?? 'fake',
					INFOMANIAK_REDIRECT_URI:
						process.env.INFOMANIAK_REDIRECT_URI ?? 'http://localhost:4000/oauth/callback',
					TEST_MODE: 'true'
				}
			}
		: undefined,
	projects: [
		{
			name: 'Small Phone (320px)',
			use: {
				...devices['iPhone SE'],
				viewport: { width: 320, height: 568 },
				screen: { width: 320, height: 568 },
				defaultBrowserType: 'chromium'
			}
		},
		{
			name: 'iPhone SE (375px)',
			use: {
				...devices['iPhone SE'],
				defaultBrowserType: 'chromium'
			}
		},
		{
			name: 'iPhone 12 (390px)',
			use: {
				...devices['iPhone 12'],
				defaultBrowserType: 'chromium'
			}
		},
		{
			name: 'Pixel 5 (393px)',
			use: { ...devices['Pixel 5'] }
		}
	]
});

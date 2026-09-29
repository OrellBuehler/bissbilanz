import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:4000';

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.e2e.ts',
	globalSetup: './tests/e2e/global-setup.ts',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	snapshotPathTemplate: 'tests/e2e/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
	expect: {
		toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.002 }
	},
	reporter: process.env.CI
		? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
		: [['list'], ['html', { open: 'on-failure' }]],
	use: {
		baseURL,
		launchOptions: {
			args: process.env.PW_HOST_MAP_IP
				? [`--host-resolver-rules=MAP localhost ${process.env.PW_HOST_MAP_IP}`]
				: []
		},
		storageState: 'tests/e2e/.auth/session.json'
	},
	webServer:
		process.env.CI && !process.env.PW_EXTERNAL_SERVER
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
						TEST_MODE: 'true',
						TEST_AUTH_TOKEN: 'test-integration-token',
						PORT: '4000'
					}
				}
			: undefined,
	projects: [
		{
			name: 'Small Phone (320px)',
			testMatch: '**/mobile-layout.e2e.ts',
			use: {
				...devices['iPhone SE'],
				viewport: { width: 320, height: 568 },
				screen: { width: 320, height: 568 },
				defaultBrowserType: 'chromium'
			}
		},
		{
			name: 'iPhone SE (375px)',
			testMatch: '**/mobile-layout.e2e.ts',
			use: {
				...devices['iPhone SE'],
				defaultBrowserType: 'chromium'
			}
		},
		{
			name: 'iPhone 12 (390px)',
			testMatch: '**/mobile-layout.e2e.ts',
			use: {
				...devices['iPhone 12'],
				defaultBrowserType: 'chromium'
			}
		},
		{
			name: 'Pixel 5 (393px)',
			testMatch: '**/mobile-layout.e2e.ts',
			use: { ...devices['Pixel 5'] }
		},
		{
			name: 'flows',
			testMatch: '**/flows/*.e2e.ts',
			use: { ...devices['Pixel 5'], locale: 'en-US', timezoneId: 'UTC' }
		},
		...(['light', 'dark'] as const).flatMap((colorScheme) => [
			{
				name: `visual-mobile-${colorScheme}`,
				testMatch: '**/visual/*.e2e.ts',
				use: { ...devices['Pixel 5'], locale: 'en-US', timezoneId: 'UTC', colorScheme }
			},
			{
				name: `visual-desktop-${colorScheme}`,
				testMatch: '**/visual/*.e2e.ts',
				use: { ...devices['Desktop Chrome'], locale: 'en-US', timezoneId: 'UTC', colorScheme }
			}
		])
	]
});

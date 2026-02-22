import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	globalSetup: './tests/e2e/global-setup.ts',
	use: {
		baseURL: 'http://localhost:4000',
		storageState: 'tests/e2e/.auth/session.json'
	},
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

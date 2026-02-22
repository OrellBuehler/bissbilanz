import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function assertNoHorizontalOverflow(page: Page) {
	const data = await page.evaluate(() => ({
		bodyScrollWidth: document.body.scrollWidth,
		docScrollWidth: document.documentElement.scrollWidth,
		windowWidth: window.innerWidth
	}));
	expect(data.bodyScrollWidth, 'body must not overflow horizontally').toBeLessThanOrEqual(
		data.windowWidth
	);
	expect(data.docScrollWidth, 'document must not overflow horizontally').toBeLessThanOrEqual(
		data.windowWidth
	);
}

export async function assertNoElementsOverflowingViewport(page: Page) {
	const offenders = await page.evaluate(() => {
		const viewportWidth = window.innerWidth;
		const results: string[] = [];
		document.querySelectorAll('*').forEach((el) => {
			const rect = el.getBoundingClientRect();
			if (rect.right > viewportWidth + 2) {
				const tag = el.tagName.toLowerCase();
				const cls =
					el.className && typeof el.className === 'string'
						? el.className.trim().slice(0, 40)
						: '';
				results.push(`${tag}${cls ? '.' + cls.replace(/\s+/g, '.') : ''} (right: ${Math.round(rect.right)}px, viewport: ${viewportWidth}px)`);
			}
		});
		return [...new Set(results)].slice(0, 10);
	});
	expect(offenders, 'no elements should overflow the viewport').toEqual([]);
}

export async function assertNoOverlappingInteractiveElements(page: Page) {
	const overlaps = await page.evaluate(() => {
		const selector = 'button, a, input, select, textarea, [role="button"], [role="link"]';
		const elements = Array.from(document.querySelectorAll(selector))
			.map((el) => ({ el, rect: el.getBoundingClientRect() }))
			.filter(
				({ rect }) =>
					rect.width > 0 &&
					rect.height > 0 &&
					rect.top < window.innerHeight &&
					rect.bottom > 0
			);

		const results: string[] = [];
		for (let i = 0; i < elements.length; i++) {
			for (let j = i + 1; j < elements.length; j++) {
				const a = elements[i].rect;
				const b = elements[j].rect;
				const intersects =
					a.left < b.right - 4 &&
					a.right > b.left + 4 &&
					a.top < b.bottom - 4 &&
					a.bottom > b.top + 4;
				if (intersects) {
					const textA = elements[i].el.textContent?.trim().slice(0, 20) ?? '';
					const textB = elements[j].el.textContent?.trim().slice(0, 20) ?? '';
					const tagA = elements[i].el.tagName.toLowerCase();
					const tagB = elements[j].el.tagName.toLowerCase();
					results.push(`"${textA}" (${tagA}) overlaps "${textB}" (${tagB})`);
				}
			}
		}
		return results.slice(0, 5);
	});
	expect(overlaps, 'interactive elements should not overlap').toEqual([]);
}

export async function assertMobileLayout(page: Page) {
	await assertNoHorizontalOverflow(page);
	await assertNoElementsOverflowingViewport(page);
	await assertNoOverlappingInteractiveElements(page);
}

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
					el.className && typeof el.className === 'string' ? el.className.trim().slice(0, 40) : '';
				results.push(
					`${tag}${cls ? '.' + cls.replace(/\s+/g, '.') : ''} (right: ${Math.round(rect.right)}px, viewport: ${viewportWidth}px)`
				);
			}
		});
		return [...new Set(results)].slice(0, 10);
	});
	expect(offenders, 'no elements should overflow the viewport').toEqual([]);
}

export async function assertNoOverlappingInteractiveElements(page: Page) {
	const overlaps = await page.evaluate(() => {
		const selector = 'button, a, input, select, textarea, [role="button"], [role="link"]';
		const allInteractive = Array.from(document.querySelectorAll(selector));

		function isInFixedContainer(el: Element): boolean {
			let node: Element | null = el;
			while (node) {
				if (getComputedStyle(node).position === 'fixed') return true;
				node = node.parentElement;
			}
			return false;
		}

		const elements = allInteractive
			.filter((el) => {
				let parent = el.parentElement;
				while (parent) {
					if (parent.matches(selector)) return false;
					parent = parent.parentElement;
				}
				return true;
			})
			.map((el) => ({ el, rect: el.getBoundingClientRect(), fixed: isInFixedContainer(el) }))
			.filter(
				({ rect }) =>
					rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0
			);

		const results: string[] = [];
		for (let i = 0; i < elements.length; i++) {
			for (let j = i + 1; j < elements.length; j++) {
				// Skip overlaps between fixed and non-fixed elements (different layers)
				if (elements[i].fixed !== elements[j].fixed) continue;
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

export async function assertBottomNavDoesNotOverlapContent(page: Page) {
	const result = await page.evaluate(() => {
		const nav = document.querySelector('nav.fixed.bottom-0');
		const main = document.querySelector('main');
		if (!nav || !main) return null;

		const mainChildren = Array.from(main.querySelectorAll('*')).filter((el) => {
			const rect = el.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0;
		});
		if (mainChildren.length === 0) return null;

		// Scroll to bottom to check the worst case
		main.scrollTop = main.scrollHeight;
		window.scrollTo(0, document.body.scrollHeight);

		const navRect = nav.getBoundingClientRect();
		const overlapping: string[] = [];

		for (const el of mainChildren) {
			const rect = el.getBoundingClientRect();
			if (rect.bottom > navRect.top + 2 && rect.top < navRect.bottom - 2) {
				// Check if element is actually visible (not clipped by overflow)
				const style = getComputedStyle(el);
				if (style.visibility !== 'hidden' && style.opacity !== '0') {
					const tag = el.tagName.toLowerCase();
					const text = el.textContent?.trim().slice(0, 30) ?? '';
					overlapping.push(
						`${tag}("${text}") bottom:${Math.round(rect.bottom)} nav-top:${Math.round(navRect.top)}`
					);
				}
			}
		}

		return overlapping.slice(0, 5);
	});

	if (result && result.length > 0) {
		expect(result, 'main content should not be overlapped by bottom nav').toEqual([]);
	}
}

export async function assertMobileLayout(page: Page) {
	await assertNoHorizontalOverflow(page);
	await assertNoElementsOverflowingViewport(page);
	await assertNoOverlappingInteractiveElements(page);
	await assertBottomNavDoesNotOverlapContent(page);
}

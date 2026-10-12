import { getLocale } from '$lib/paraglide/runtime';

export const MAX_BUDGET_USD = 1000;

export function formatUsd(value: number, locale: string = getLocale()): string {
	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(value);
}

export function formatDateTime(value: string, locale: string = getLocale()): string {
	return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
		new Date(value)
	);
}

export function formatDate(value: string, locale: string = getLocale()): string {
	return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}

export function formatDayLabel(isoDay: string, locale: string = getLocale()): string {
	return new Intl.DateTimeFormat(locale, {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${isoDay}T00:00:00Z`));
}

export type BudgetInput = { ok: true; value: number | null } | { ok: false };

// Empty means "use the default budget". Accepts a comma as the decimal separator.
export function parseBudgetInput(text: string): BudgetInput {
	const trimmed = text.trim();
	if (trimmed === '') return { ok: true, value: null };
	if (!/^\d+([.,]\d{1,2})?$/.test(trimmed)) return { ok: false };
	const value = Number(trimmed.replace(',', '.'));
	if (!Number.isFinite(value) || value > MAX_BUDGET_USD) return { ok: false };
	return { ok: true, value };
}

export function budgetToInput(value: number | null): string {
	return value === null ? '' : String(value);
}

const PROVIDER_LABELS: Record<string, string> = {
	infomaniak: 'Infomaniak',
	google: 'Google',
	apple: 'Apple'
};

export function providerLabel(provider: string): string {
	return PROVIDER_LABELS[provider] ?? provider;
}

export function initialOf(user: { name: string | null; email: string | null }): string {
	return (user.name || user.email || '?').charAt(0).toUpperCase();
}

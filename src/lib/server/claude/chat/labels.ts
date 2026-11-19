import * as m from '$lib/paraglide/messages';
import { isLocale } from '$lib/paraglide/runtime';

export type ChatLocale = 'en' | 'de';

type Message = (inputs: Record<string, unknown>, options: { locale: ChatLocale }) => string;

export const toChatLocale = (locale: string | null | undefined): ChatLocale => {
	const base = locale?.toLowerCase().split(/[-_]/)[0] ?? null;
	return base && isLocale(base) ? base : 'en';
};

export function message(key: string, inputs: Record<string, unknown>, locale: ChatLocale): string {
	const fn = (m as unknown as Record<string, Message | undefined>)[key];
	if (!fn) throw new Error(`Missing chat message ${key}`);
	return fn(inputs, { locale });
}

export const hasMessage = (key: string): boolean =>
	typeof (m as unknown as Record<string, unknown>)[key] === 'function';

export const toolLabel = (name: string, locale: ChatLocale): string =>
	hasMessage(`chat_tool_${name}`) ? message(`chat_tool_${name}`, {}, locale) : name;

export function formatDate(date: string, locale: ChatLocale): string {
	const parsed = new Date(`${date}T00:00:00Z`);
	if (Number.isNaN(parsed.getTime())) return date;
	return new Intl.DateTimeFormat(locale === 'de' ? 'de-CH' : 'en-GB', {
		dateStyle: 'medium',
		timeZone: 'UTC'
	}).format(parsed);
}

export function formatNumber(value: number, locale: ChatLocale, maximumFractionDigits = 1): string {
	return new Intl.NumberFormat(locale === 'de' ? 'de-CH' : 'en-GB', {
		maximumFractionDigits
	}).format(value);
}

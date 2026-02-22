import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { HTMLAttributes } from 'svelte/elements';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
	ref?: U | null;
};

export type WithoutChildren<T> = T extends { children?: unknown } ? Omit<T, 'children'> : T;

export type WithoutChild<T> = T extends { child?: unknown } ? Omit<T, 'child'> : T;

export type WithoutChildrenOrChild<T> = T extends { children?: unknown; child?: unknown }
	? Omit<T, 'children' | 'child'>
	: T extends { children?: unknown }
		? Omit<T, 'children'>
		: T extends { child?: unknown }
			? Omit<T, 'child'>
			: T;

export type Primitive<T, U extends keyof HTMLAttributes<HTMLElement> = never> = Omit<
	HTMLAttributes<HTMLElement>,
	U
> &
	T;

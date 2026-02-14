<script lang="ts">
	import { page } from '$app/state';
	import { locales, localizeHref, getLocale } from '$lib/paraglide/runtime';

	const localeNames: Record<string, string> = {
		en: 'English',
		de: 'Deutsch'
	};

	const currentLocale = $derived(getLocale());
</script>

<div class="flex flex-wrap gap-2">
	{#each locales as locale}
		<a
			href={localizeHref(page.url.pathname, { locale })}
			data-sveltekit-reload
			class="px-3 py-1.5 rounded-md text-sm transition-colors {locale === currentLocale
				? 'bg-primary text-primary-foreground'
				: 'bg-muted hover:bg-muted/80'}"
		>
			{localeNames[locale]}
		</a>
	{/each}
</div>

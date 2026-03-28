<script lang="ts">
	import '@fontsource-variable/manrope';
	import ChartColumn from '@lucide/svelte/icons/chart-column';
	import ScanBarcode from '@lucide/svelte/icons/scan-barcode';
	import Bot from '@lucide/svelte/icons/bot';
	import Smartphone from '@lucide/svelte/icons/smartphone';
	import CookingPot from '@lucide/svelte/icons/cooking-pot';
	import Pill from '@lucide/svelte/icons/pill';
	import { login } from '$lib/stores/auth.svelte';
	import * as m from '$lib/paraglide/messages';

	function scrollToFeatures() {
		document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
	}
</script>

<div class="min-h-screen bg-background text-foreground">
	<!-- Header -->
	<header class="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
		<div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
			<span class="manrope text-xl font-bold tracking-tight">{m.app_title()}</span>
			<button
				class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
				onclick={login}
			>
				{m.auth_login()}
			</button>
		</div>
	</header>

	<!-- Hero -->
	<section class="px-6 pb-32 pt-24 text-center">
		<div class="mx-auto max-w-3xl">
			<div
				class="mb-8 inline-flex items-center rounded-full bg-muted px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
			>
				{m.landing_badge()}
			</div>
			<h1 class="manrope mb-6 text-5xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl">
				{m.landing_headline_1()}<br />
				<span class="text-primary">{m.landing_headline_2()}</span>
			</h1>
			<p class="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-muted-foreground">
				{m.landing_subheading()}
			</p>
			<div class="flex flex-col items-center justify-center gap-3 sm:flex-row">
				<button
					class="rounded-full bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90"
					onclick={login}
				>
					{m.landing_cta_primary()}
				</button>
				<button
					class="rounded-full border border-border px-8 py-3.5 text-base font-semibold text-foreground transition-colors hover:bg-muted"
					onclick={scrollToFeatures}
				>
					{m.landing_cta_secondary()}
				</button>
			</div>
		</div>
	</section>

	<!-- Features -->
	<section id="features" class="bg-muted/30 px-6 py-24">
		<div class="mx-auto max-w-5xl">
			<h2 class="manrope mb-16 text-center text-3xl font-bold tracking-tight">
				{m.landing_features_title()}
			</h2>
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				<div class="rounded-xl border border-border bg-card p-6">
					<ChartColumn class="mb-4 text-primary" size={24} />
					<h3 class="mb-2 font-semibold">{m.landing_feature_macros_title()}</h3>
					<p class="text-sm leading-relaxed text-muted-foreground">
						{m.landing_feature_macros_desc()}
					</p>
				</div>
				<div class="rounded-xl border border-border bg-card p-6">
					<ScanBarcode class="mb-4 text-primary" size={24} />
					<h3 class="mb-2 font-semibold">{m.landing_feature_barcode_title()}</h3>
					<p class="text-sm leading-relaxed text-muted-foreground">
						{m.landing_feature_barcode_desc()}
					</p>
				</div>
				<div class="rounded-xl border border-border bg-card p-6">
					<Bot class="mb-4 text-primary" size={24} />
					<h3 class="mb-2 font-semibold">{m.landing_feature_ai_title()}</h3>
					<p class="text-sm leading-relaxed text-muted-foreground">
						{m.landing_feature_ai_desc()}
					</p>
				</div>
				<div class="rounded-xl border border-border bg-card p-6">
					<Smartphone class="mb-4 text-primary" size={24} />
					<h3 class="mb-2 font-semibold">{m.landing_feature_pwa_title()}</h3>
					<p class="text-sm leading-relaxed text-muted-foreground">
						{m.landing_feature_pwa_desc()}
					</p>
				</div>
				<div class="rounded-xl border border-border bg-card p-6">
					<CookingPot class="mb-4 text-primary" size={24} />
					<h3 class="mb-2 font-semibold">{m.landing_feature_recipes_title()}</h3>
					<p class="text-sm leading-relaxed text-muted-foreground">
						{m.landing_feature_recipes_desc()}
					</p>
				</div>
				<div class="rounded-xl border border-border bg-card p-6">
					<Pill class="mb-4 text-primary" size={24} />
					<h3 class="mb-2 font-semibold">{m.landing_feature_supplements_title()}</h3>
					<p class="text-sm leading-relaxed text-muted-foreground">
						{m.landing_feature_supplements_desc()}
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- CTA -->
	<section class="px-6 py-24 text-center">
		<div class="mx-auto max-w-2xl">
			<h2 class="manrope mb-4 text-4xl font-bold tracking-tight">{m.landing_cta_headline()}</h2>
			<p class="mb-8 text-muted-foreground">{m.landing_cta_subtext()}</p>
			<button
				class="rounded-full bg-primary px-10 py-4 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90"
				onclick={login}
			>
				{m.landing_cta_primary()}
			</button>
		</div>
	</section>

	<!-- Footer -->
	<footer class="border-t border-border px-6 py-8">
		<div
			class="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row"
		>
			<span class="manrope font-bold">{m.app_title()}</span>
			<a href="/privacy" class="transition-colors hover:text-foreground">
				{m.landing_footer_privacy()}
			</a>
			<span>© {new Date().getFullYear()} {m.app_title()}</span>
		</div>
	</footer>
</div>

<style>
	.manrope {
		font-family: 'Manrope Variable', sans-serif;
	}
</style>

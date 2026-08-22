<script lang="ts">
	import ChartColumn from '@lucide/svelte/icons/chart-column';
	import ScanBarcode from '@lucide/svelte/icons/scan-barcode';
	import ScanText from '@lucide/svelte/icons/scan-text';
	import Bot from '@lucide/svelte/icons/bot';
	import Smartphone from '@lucide/svelte/icons/smartphone';
	import CookingPot from '@lucide/svelte/icons/cooking-pot';
	import Pill from '@lucide/svelte/icons/pill';
	import Scale from '@lucide/svelte/icons/scale';
	import Moon from '@lucide/svelte/icons/moon';
	import Timer from '@lucide/svelte/icons/timer';
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import CloudOff from '@lucide/svelte/icons/cloud-off';
	import Watch from '@lucide/svelte/icons/watch';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Globe from '@lucide/svelte/icons/globe';
	import Apple from '@lucide/svelte/icons/apple';
	import { Button } from '$lib/components/ui/button/index.js';
	import Seo from '$lib/components/Seo.svelte';
	import { getLocale } from '$lib/paraglide/runtime';
	import { absoluteUrl, GITHUB_URL, OG_IMAGE, SITE_URL, TESTFLIGHT_URL } from '$lib/seo';
	import * as m from '$lib/paraglide/messages';

	const testflightUrl = TESTFLIGHT_URL;

	const features = [
		{
			icon: ChartColumn,
			title: m.landing_feature_macros_title,
			desc: m.landing_feature_macros_desc
		},
		{
			icon: ScanBarcode,
			title: m.landing_feature_barcode_title,
			desc: m.landing_feature_barcode_desc
		},
		{
			icon: ScanText,
			title: m.landing_feature_label_title,
			desc: m.landing_feature_label_desc,
			platform: m.landing_platform_mobile
		},
		{ icon: Bot, title: m.landing_feature_ai_title, desc: m.landing_feature_ai_desc },
		{
			icon: CookingPot,
			title: m.landing_feature_recipes_title,
			desc: m.landing_feature_recipes_desc
		},
		{
			icon: Pill,
			title: m.landing_feature_supplements_title,
			desc: m.landing_feature_supplements_desc
		},
		{ icon: Scale, title: m.landing_feature_weight_title, desc: m.landing_feature_weight_desc },
		{ icon: Moon, title: m.landing_feature_sleep_title, desc: m.landing_feature_sleep_desc },
		{ icon: Timer, title: m.landing_feature_fasting_title, desc: m.landing_feature_fasting_desc },
		{
			icon: ChartLine,
			title: m.landing_feature_insights_title,
			desc: m.landing_feature_insights_desc
		},
		{
			icon: CloudOff,
			title: m.landing_feature_offline_title,
			desc: m.landing_feature_offline_desc
		},
		{
			icon: Watch,
			title: m.landing_feature_watch_title,
			desc: m.landing_feature_watch_desc,
			platform: m.landing_platform_mobile
		},
		{
			icon: HeartPulse,
			title: m.landing_feature_health_title,
			desc: m.landing_feature_health_desc,
			platform: m.landing_platform_mobile
		},
		{ icon: Smartphone, title: m.landing_feature_pwa_title, desc: m.landing_feature_pwa_desc },
		{
			icon: ShieldCheck,
			title: m.landing_feature_privacy_title,
			desc: m.landing_feature_privacy_desc
		}
	];

	const apps = [
		{
			icon: Globe,
			title: m.landing_apps_web_title,
			desc: m.landing_apps_web_desc,
			cta: m.landing_apps_web_cta,
			href: '/login',
			external: false
		},
		{
			icon: Apple,
			title: m.landing_apps_ios_title,
			desc: m.landing_apps_ios_desc,
			cta: m.landing_apps_ios_cta,
			href: testflightUrl,
			external: true
		},
		{
			icon: Smartphone,
			title: m.landing_apps_android_title,
			desc: m.landing_apps_android_desc,
			cta: m.landing_apps_android_cta,
			href: '/support',
			external: false
		}
	];

	const structuredData = $derived({
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'WebSite',
				'@id': `${SITE_URL}/#website`,
				url: SITE_URL,
				name: 'Bissbilanz',
				alternateName: 'Bissbilanz — ' + m.app_tagline(),
				description: m.landing_subheading(),
				inLanguage: getLocale(),
				publisher: { '@id': `${SITE_URL}/#person` }
			},
			{
				'@type': 'Person',
				'@id': `${SITE_URL}/#person`,
				name: 'Orell Bühler',
				url: 'https://orellbuehler.ch',
				sameAs: ['https://github.com/OrellBuehler']
			},
			{
				'@type': 'SoftwareApplication',
				'@id': `${SITE_URL}/#app`,
				name: 'Bissbilanz',
				applicationCategory: 'HealthApplication',
				applicationSubCategory: 'Nutrition & Calorie Tracker',
				operatingSystem: 'Web, Android, iOS, watchOS',
				url: absoluteUrl('/', getLocale()),
				description: m.landing_subheading(),
				image: OG_IMAGE,
				screenshot: OG_IMAGE,
				inLanguage: ['en', 'de'],
				isAccessibleForFree: true,
				offers: { '@type': 'Offer', price: '0', priceCurrency: 'CHF' },
				author: { '@id': `${SITE_URL}/#person` },
				publisher: { '@id': `${SITE_URL}/#person` },
				softwareHelp: `${SITE_URL}/support`,
				privacyPolicy: `${SITE_URL}/privacy`,
				featureList: features.map((feature) => feature.title()),
				sameAs: [GITHUB_URL, TESTFLIGHT_URL]
			}
		]
	});
</script>

<Seo
	title={m.seo_home_title()}
	description={m.landing_subheading()}
	path="/"
	jsonLd={structuredData}
/>

<div class="min-h-screen bg-background text-foreground">
	<!-- Header -->
	<header
		class="sticky top-0 z-50 border-b border-outline-variant/15 bg-background/80 backdrop-blur-sm"
	>
		<div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
			<span class="font-heading text-xl font-bold tracking-tight">{m.app_title()}</span>
			<div class="flex items-center gap-2">
				<Button variant="ghost" href="#features" class="hidden sm:inline-flex">
					{m.landing_cta_secondary()}
				</Button>
				<Button href="/login">
					{m.auth_login()}
				</Button>
			</div>
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
			<h1
				class="font-heading mb-6 text-5xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl"
			>
				{m.landing_headline_1()}<br />
				<span class="text-primary">{m.landing_headline_2()}</span>
			</h1>
			<p class="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-muted-foreground">
				{m.landing_subheading()}
			</p>
			<div class="flex flex-col items-center justify-center gap-3 sm:flex-row">
				<Button size="lg" href="/login">
					{m.landing_cta_primary()}
				</Button>
				<Button variant="outline" size="lg" href={testflightUrl} target="_blank" rel="noopener">
					<Apple />
					{m.landing_cta_beta()}
				</Button>
			</div>
			<p class="mt-6 text-sm text-muted-foreground">{m.landing_hero_platforms()}</p>
		</div>
	</section>

	<!-- Features -->
	<section id="features" class="bg-surface-container/50 px-6 py-24">
		<div class="mx-auto max-w-5xl">
			<h2 class="font-heading mb-16 text-center text-3xl font-bold tracking-tight">
				{m.landing_features_title()}
			</h2>
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{#each features as feature (feature.title)}
					{@const Icon = feature.icon}
					<div class="rounded-2xl bg-surface-container-low p-6">
						<Icon class="mb-4 text-primary" size={24} />
						<h3 class="mb-2 flex flex-wrap items-center gap-2 font-semibold">
							{feature.title()}
							{#if feature.platform}
								<span
									class="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground"
								>
									{feature.platform()}
								</span>
							{/if}
						</h3>
						<p class="text-sm leading-relaxed text-muted-foreground">
							{feature.desc()}
						</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Apps -->
	<section id="apps" class="px-6 py-24">
		<div class="mx-auto max-w-5xl">
			<h2 class="font-heading mb-3 text-center text-3xl font-bold tracking-tight">
				{m.landing_apps_title()}
			</h2>
			<p class="mx-auto mb-16 max-w-xl text-center text-muted-foreground">
				{m.landing_apps_subtitle()}
			</p>
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{#each apps as app (app.title)}
					{@const Icon = app.icon}
					<div
						class="flex flex-col rounded-2xl border border-outline-variant/15 bg-surface-container-low p-6"
					>
						<Icon class="mb-4 text-primary" size={24} />
						<h3 class="mb-2 font-semibold">{app.title()}</h3>
						<p class="mb-6 text-sm leading-relaxed text-muted-foreground">{app.desc()}</p>
						<Button
							variant="outline"
							class="mt-auto w-full"
							href={app.href}
							target={app.external ? '_blank' : undefined}
							rel={app.external ? 'noopener' : undefined}
						>
							{app.cta()}
						</Button>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- CTA -->
	<section class="bg-surface-container/50 px-6 py-24 text-center">
		<div class="mx-auto max-w-2xl">
			<h2 class="font-heading mb-4 text-4xl font-bold tracking-tight">
				{m.landing_cta_headline()}
			</h2>
			<p class="mb-8 text-muted-foreground">{m.landing_cta_subtext()}</p>
			<div class="flex flex-col items-center justify-center gap-3 sm:flex-row">
				<Button size="lg" href="/login">
					{m.landing_cta_primary()}
				</Button>
				<Button variant="outline" size="lg" href={testflightUrl} target="_blank" rel="noopener">
					<Apple />
					{m.landing_cta_beta()}
				</Button>
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="border-t border-outline-variant/15 px-6 py-8">
		<div
			class="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row"
		>
			<span class="font-heading font-bold">{m.app_title()}</span>
			<Button
				variant="link"
				href="/privacy"
				class="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
			>
				{m.landing_footer_privacy()}
			</Button>
			<Button
				variant="link"
				href="/support"
				class="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
			>
				{m.landing_footer_support()}
			</Button>
			<span>© {new Date().getFullYear()} {m.app_title()}</span>
		</div>
	</footer>
</div>

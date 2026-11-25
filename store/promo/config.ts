export type Locale = 'en' | 'de';
export type Localized = Record<Locale, string>;

export type Badge = {
	text: Localized;
	color: string;
	x: number;
	y: number;
};

export type Zoom = {
	crop: { x: number; y: number; w: number; h: number };
	x: number;
	y: number;
	width: number;
};

export type Slide = {
	id: string;
	screen: string;
	theme?: 'light' | 'dark';
	headline: Localized;
	subline?: Localized;
	textPosition?: 'top' | 'bottom';
	phone?: { width?: number; top?: number; left?: number; rotate?: number };
	statusBar?: string | false;
	badges?: Badge[];
	zoom?: Zoom;
};

export type Target = {
	width: number;
	height: number;
	device: 'iphone' | 'android';
	screens: string;
	slides: Slide[];
	// Screens of the two phones that sit behind the seams of the first three slides.
	panoramaBack: [string, string];
};

export const macro = {
	calories: '#3B82F6',
	protein: '#EF4444',
	carbs: '#F97316',
	fat: '#EAB308',
	fiber: '#22C55E',
	brand: 'oklch(0.469 0.121 153)'
};

const iosSlides: Slide[] = [
	{
		id: 'dashboard',
		screen: 'dashboard.png',
		headline: { en: 'Know where your *day* stands', de: 'Sieh, wo dein *Tag* steht' },
		subline: {
			en: 'Calories and macros against your own goals',
			de: 'Kalorien und Makros gegen deine eigenen Ziele'
		}
	},
	{
		id: 'log-food',
		screen: 'log-food.png',
		headline: { en: 'Log a meal in *seconds*', de: 'Mahlzeit in *Sekunden* eintragen' },
		subline: {
			en: 'Barcodes, nutrition labels, favorites and recents',
			de: 'Barcodes, Nährwerttabellen, Favoriten und Zuletzt'
		}
	},
	{
		id: 'insights',
		screen: 'insights-dark.png',
		theme: 'dark',
		headline: { en: 'Insights beyond *calories*', de: 'Einblicke jenseits der *Kalorien*' },
		subline: {
			en: 'Processing level, omega ratio and inflammation index',
			de: 'Verarbeitungsgrad, Omega-Verhältnis und Entzündungsindex'
		}
	},
	{
		id: 'weight',
		screen: 'weight.png',
		headline: {
			en: 'A weight *trend*, not daily noise',
			de: 'Ein Gewichts*trend* statt Tagesrauschen'
		},
		subline: {
			en: 'Smoothed trend, target and projection',
			de: 'Geglätteter Trend, Ziel und Prognose'
		}
	},
	{
		id: 'recipe',
		screen: 'recipe.png',
		headline: { en: 'Build a recipe *once*', de: 'Rezept *einmal* anlegen' },
		subline: {
			en: 'Log it by serving, nutrition calculated for you',
			de: 'Pro Portion eintragen, Nährwerte automatisch'
		}
	},
	{
		id: 'calendar',
		screen: 'calendar.png',
		headline: { en: 'Your month at a *glance*', de: 'Dein Monat auf einen *Blick*' },
		subline: {
			en: 'See which days hit your goals',
			de: 'Sieh, an welchen Tagen du im Ziel warst'
		}
	},
	{
		id: 'sleep',
		screen: 'sleep.png',
		headline: { en: 'Sleep and food, *side by side*', de: 'Schlaf und Essen, *Seite an Seite*' },
		subline: {
			en: 'Duration, quality and trends over time',
			de: 'Dauer, Qualität und Trends im Verlauf'
		}
	},
	{
		id: 'private',
		screen: 'dashboard-dark.png',
		theme: 'dark',
		headline: { en: 'Private *by design*', de: 'Privat *von Grund auf*' },
		subline: {
			en: 'No ads, no tracking, usable without an account',
			de: 'Keine Werbung, kein Tracking, ohne Konto nutzbar'
		}
	}
];

const androidSlides: Slide[] = [
	{
		id: 'dashboard',
		screen: 'dashboard.png',
		headline: { en: 'Know where your *day* stands', de: 'Sieh, wo dein *Tag* steht' },
		subline: {
			en: 'Calories and macros against your own goals',
			de: 'Kalorien und Makros gegen deine eigenen Ziele'
		}
	},
	{
		id: 'log-food',
		screen: 'log-food.png',
		headline: { en: 'Log a meal in *seconds*', de: 'Mahlzeit in *Sekunden* eintragen' },
		subline: {
			en: 'Barcodes, nutrition labels, favorites and recents',
			de: 'Barcodes, Nährwerttabellen, Favoriten und Zuletzt'
		}
	},
	{
		id: 'insights',
		screen: 'insights-dark.png',
		theme: 'dark',
		headline: { en: 'See where your *macros* come from', de: 'Sieh, woher deine *Makros* kommen' },
		subline: {
			en: 'Trends, meal breakdowns and top sources',
			de: 'Trends, Mahlzeiten und Top-Quellen'
		}
	},
	{
		id: 'foods',
		screen: 'foods.png',
		headline: { en: 'Your foods, *one tap* away', de: 'Deine Lebensmittel, *ein Tipp* entfernt' },
		subline: {
			en: 'Your own database — even offline',
			de: 'Deine eigene Datenbank — auch offline'
		}
	},
	{
		id: 'weight',
		screen: 'weight.png',
		headline: {
			en: 'A weight *trend*, not daily noise',
			de: 'Ein Gewichts*trend* statt Tagesrauschen'
		},
		subline: {
			en: 'Smoothed trend and maintenance calories',
			de: 'Geglätteter Trend und Erhaltungsbedarf'
		}
	},
	{
		id: 'recipe',
		screen: 'recipe.png',
		theme: 'dark',
		headline: { en: 'Build a recipe *once*', de: 'Rezept *einmal* anlegen' },
		subline: {
			en: 'Log it by serving, nutrition calculated for you',
			de: 'Pro Portion eintragen, Nährwerte automatisch'
		}
	},
	{
		id: 'nutrients',
		screen: 'nutrients.png',
		headline: { en: '*43 nutrients.* Show only yours.', de: '*43 Nährstoffe.* Zeig nur deine.' },
		subline: {
			en: 'Vitamins, minerals, omega-3 and more',
			de: 'Vitamine, Mineralstoffe, Omega-3 und mehr'
		}
	},
	{
		id: 'private',
		screen: 'dashboard-dark.png',
		theme: 'dark',
		headline: { en: 'Private *by design*', de: 'Privat *von Grund auf*' },
		subline: {
			en: 'No ads, no tracking, usable without an account',
			de: 'Keine Werbung, kein Tracking, ohne Konto nutzbar'
		}
	}
];

// `screens` is relative to this directory; `{locale}` is replaced per locale.
export const targets: Record<string, Target> = {
	'ios-6.9': {
		width: 1320,
		height: 2868,
		device: 'iphone',
		screens: 'screens-ios/{locale}',
		slides: iosSlides,
		panoramaBack: ['weight.png', 'recipe.png']
	},
	'ios-6.5': {
		width: 1284,
		height: 2778,
		device: 'iphone',
		screens: 'screens-ios/{locale}',
		slides: iosSlides,
		panoramaBack: ['weight.png', 'recipe.png']
	},
	'play-phone': {
		width: 1080,
		height: 1920,
		device: 'android',
		screens: 'screens-android/{locale}',
		slides: androidSlides,
		panoramaBack: ['weight.png', 'recipe.png']
	}
};

export const feature = {
	width: 1024,
	height: 500,
	screens: 'screens-android/{locale}',
	tagline: {
		en: 'Calories, macros and *43+ nutrients*',
		de: 'Kalorien, Makros und *43+ Nährstoffe*'
	} as Localized,
	note: {
		en: 'No ads. No tracking. Works offline.',
		de: 'Keine Werbung. Kein Tracking. Auch offline.'
	} as Localized
};

// Shared by the feature graphic, the link preview and the website hero:
// centre phone first, then left and right.
export const heroScreens = ['dashboard.png', 'insights-dark.png', 'weight.png'];

// Link preview for the website (static/og-image.png). One image for every
// locale, so it is English.
export const og = {
	width: 1200,
	height: 630,
	screens: 'screens-ios/en',
	tagline: 'Know every bite. *Own every goal.*',
	note: 'Web · iPhone · Android · Apple Watch'
};

// Framed phones for the landing page hero (static/landing/).
export const webHero = { width: 640, screens: 'screens-ios/{locale}' };

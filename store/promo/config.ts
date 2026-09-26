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

export const sizes = {
	'6.5': { width: 1284, height: 2778 }
} as const;

export const macro = {
	calories: '#3B82F6',
	protein: '#EF4444',
	carbs: '#F97316',
	fat: '#EAB308',
	fiber: '#22C55E',
	brand: 'oklch(0.469 0.121 153)'
};

export const slides: Slide[] = [
	{
		id: 'insights',
		screen: 'insights.png',
		headline: { en: 'See where your *macros* come from', de: 'Sieh, woher deine *Makros* kommen' },
		subline: {
			en: 'Weekly trends, meal breakdowns and top sources',
			de: 'Wochentrends, Mahlzeiten und Top-Quellen'
		},
		statusBar: '#000',
		zoom: { crop: { x: 48, y: 805, w: 1110, h: 830 }, x: 0.035, y: 0.48, width: 0.8 }
	},
	{
		id: 'ai-estimate',
		screen: 'ai-estimate.png',
		headline: { en: 'Describe it. Snap it. *Logged.*', de: 'Beschreiben. Knipsen. *Geloggt.*' },
		subline: {
			en: 'AI meal estimates, right on your iPhone',
			de: 'KI-Schätzung direkt auf dem iPhone'
		},
		statusBar: '#000',
		badges: [
			{
				text: { en: 'On-device AI', de: 'KI auf dem Gerät' },
				color: macro.brand,
				x: 0.52,
				y: 0.582
			},
			{
				text: { en: 'Up to 5 photos', de: 'Bis zu 5 Fotos' },
				color: macro.calories,
				x: 0.5,
				y: 0.733
			}
		]
	},
	{
		id: 'foods',
		screen: 'foods.png',
		theme: 'dark',
		headline: { en: 'Your foods, *one tap* away', de: 'Deine Lebensmittel, *ein Tipp* entfernt' },
		subline: {
			en: 'Barcodes, favorites and recents — even offline',
			de: 'Barcodes, Favoriten und Zuletzt — auch offline'
		},
		statusBar: '#000'
	},
	{
		id: 'widget-calories',
		screen: 'widget-calories.png',
		headline: { en: 'Your day on the *home screen*', de: 'Dein Tag auf dem *Homescreen*' },
		subline: {
			en: 'Widgets for calories, macros and quick logging',
			de: 'Widgets für Kalorien, Makros und schnelles Loggen'
		},
		statusBar: false
	},
	{
		id: 'control-scan',
		screen: 'control-scan.png',
		theme: 'dark',
		headline: {
			en: 'Scan straight from *Control Center*',
			de: 'Scannen aus dem *Kontrollzentrum*'
		},
		subline: {
			en: 'Barcodes and nutrition labels in seconds',
			de: 'Barcodes und Nährwerttabellen in Sekunden'
		},
		statusBar: false
	},
	{
		id: 'apple-health',
		screen: 'apple-health.png',
		headline: { en: 'Works with *Apple Health*', de: 'Verbunden mit *Apple Health*' },
		subline: {
			en: 'Weight, sleep and workout calories in sync',
			de: 'Gewicht, Schlaf und Trainingskalorien im Einklang'
		},
		statusBar: '#000'
	},
	{
		id: 'nutrients',
		screen: 'nutrients.png',
		theme: 'dark',
		headline: { en: '*43 nutrients.* Show only yours.', de: '*43 Nährstoffe.* Zeig nur deine.' },
		subline: {
			en: 'Vitamins, minerals, omega-3 and more',
			de: 'Vitamine, Mineralstoffe, Omega-3 und mehr'
		},
		statusBar: '#000'
	},
	{
		id: 'ai-settings',
		screen: 'ai-settings.png',
		headline: { en: 'Private *by design*', de: 'Privat *von Grund auf*' },
		subline: {
			en: 'No ads, no tracking — AI runs on your iPhone first',
			de: 'Keine Werbung, kein Tracking — KI zuerst auf dem iPhone'
		},
		statusBar: '#000'
	}
];

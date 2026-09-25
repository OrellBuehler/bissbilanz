import type { Locale, Slide } from './config';

type Ctx = {
	slide: Slide;
	locale: Locale;
	width: number;
	height: number;
	screenUrl: string;
	screenSize: { width: number; height: number };
	fontsDir: string;
};

const themes = {
	light: {
		bg: 'linear-gradient(180deg, #F6F1E7 0%, #ECE3D2 100%)',
		ink: 'oklch(0.224 0.005 220)',
		muted: 'oklch(0.481 0.038 250)',
		accent: 'oklch(0.469 0.121 153)',
		chip: 'rgba(255,255,255,0.92)',
		chipInk: 'oklch(0.224 0.005 220)'
	},
	dark: {
		bg: 'linear-gradient(180deg, oklch(0.24 0.012 200) 0%, oklch(0.178 0.005 220) 100%)',
		ink: 'oklch(0.966 0.003 229)',
		muted: 'oklch(0.72 0.02 145)',
		accent: 'oklch(0.746 0.181 152)',
		chip: 'rgba(40,44,46,0.92)',
		chipInk: 'oklch(0.966 0.003 229)'
	}
};

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const accentMarkup = (s: string) => escape(s).replace(/\*(.+?)\*/g, '<em>$1</em>');

function statusBar(fill: string) {
	return `<svg class="status" viewBox="0 0 402 54" preserveAspectRatio="xMidYMin meet">
	<rect width="402" height="54" fill="${fill}"/>
	<text x="72" y="36" text-anchor="middle" font-family="Inter Variable" font-weight="600" font-size="17" fill="#fff">9:41</text>
	<g fill="#fff">
		<rect x="296" y="29" width="3" height="5" rx="1"/>
		<rect x="301" y="26.5" width="3" height="7.5" rx="1"/>
		<rect x="306" y="24" width="3" height="10" rx="1"/>
		<rect x="311" y="21.5" width="3" height="12.5" rx="1"/>
	</g>
	<g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round">
		<path d="M321 26.5a11 11 0 0 1 15 0"/>
		<path d="M324.2 29.6a6.5 6.5 0 0 1 8.6 0"/>
	</g>
	<circle cx="328.5" cy="32.8" r="1.6" fill="#fff"/>
	<rect x="343" y="21.5" width="25" height="12.5" rx="4" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="1"/>
	<rect x="345" y="23.5" width="21" height="8.5" rx="2.5" fill="#fff"/>
	<rect x="369.5" y="25.5" width="1.6" height="4.5" rx="0.8" fill="#fff" fill-opacity="0.45"/>
</svg>`;
}

export function renderSlide(ctx: Ctx) {
	const { slide, locale, width: W, height: H, screenUrl, screenSize, fontsDir } = ctx;
	const t = themes[slide.theme ?? 'light'];
	const textBottom = slide.textPosition === 'bottom';

	const phoneW = (slide.phone?.width ?? 0.8) * W;
	const bezel = phoneW * 0.03;
	const screenW = phoneW - bezel * 2;
	const screenH = (screenW * screenSize.height) / screenSize.width;
	const phoneH = screenH + bezel * 2;
	const outerR = phoneW * 0.155;
	const screenR = outerR - bezel;
	const phoneTop = (slide.phone?.top ?? (textBottom ? 0.05 : 0.255)) * H;
	const phoneLeft = slide.phone?.left !== undefined ? slide.phone.left * W : (W - phoneW) / 2;
	const pt = screenW / 402;

	const badges = (slide.badges ?? [])
		.map(
			(b) =>
				`<div class="badge" style="left:${b.x * W}px;top:${b.y * H}px"><span class="dot" style="background:${b.color}"></span>${escape(b.text[locale])}</div>`
		)
		.join('');

	let zoom = '';
	if (slide.zoom) {
		const z = slide.zoom;
		const zw = z.width * W;
		const scale = zw / z.crop.w;
		zoom = `<div class="zoom" style="left:${z.x * W}px;top:${z.y * H}px;width:${zw}px;height:${z.crop.h * scale}px;background-size:${screenSize.width * scale}px auto;background-position:${-z.crop.x * scale}px ${-z.crop.y * scale}px"></div>`;
	}

	const u = W / 1320;

	return `<!doctype html>
<html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Manrope Variable'; font-weight: 200 800; src: url('${fontsDir}/manrope/files/manrope-latin-wght-normal.woff2') format('woff2'); }
@font-face { font-family: 'Manrope Variable'; font-weight: 200 800; src: url('${fontsDir}/manrope/files/manrope-latin-ext-wght-normal.woff2') format('woff2'); unicode-range: U+0100-024F; }
@font-face { font-family: 'Inter Variable'; font-weight: 100 900; src: url('${fontsDir}/inter/files/inter-latin-wght-normal.woff2') format('woff2'); }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
body { background: ${t.bg}; position: relative; -webkit-font-smoothing: antialiased; }
.text { position: absolute; left: ${96 * u}px; right: ${96 * u}px; ${textBottom ? `bottom: ${150 * u}px` : `top: ${190 * u}px`}; }
h1 { font-family: 'Manrope Variable'; font-weight: 800; font-size: ${118 * u}px; line-height: 1.04; letter-spacing: -0.03em; color: ${t.ink}; text-wrap: balance; }
h1 em { font-style: normal; color: ${t.accent}; }
p { margin-top: ${36 * u}px; font-family: 'Inter Variable'; font-weight: 500; font-size: ${44 * u}px; line-height: 1.3; color: ${t.muted}; text-wrap: balance; }
.phone { position: absolute; left: ${phoneLeft}px; top: ${phoneTop}px; width: ${phoneW}px; height: ${phoneH}px; border-radius: ${outerR}px; background: #1a1b1d; padding: ${bezel}px;
	box-shadow: inset 0 0 0 ${2 * u}px #4a4d52, inset 0 0 0 ${7 * u}px #111214, 0 ${60 * u}px ${140 * u}px rgba(20, 30, 25, ${slide.theme === 'dark' ? 0.55 : 0.28}), 0 ${16 * u}px ${40 * u}px rgba(20, 30, 25, 0.18);
	transform: rotate(${slide.phone?.rotate ?? 0}deg); }
.phone::before, .phone::after { content: ''; position: absolute; width: ${7 * u}px; background: #2b2d31; border-radius: ${4 * u}px; }
.phone::before { left: ${-6 * u}px; top: ${phoneW * 0.42}px; height: ${phoneW * 0.14}px; box-shadow: 0 ${phoneW * 0.19}px 0 #2b2d31; }
.phone::after { right: ${-6 * u}px; top: ${phoneW * 0.5}px; height: ${phoneW * 0.22}px; }
.screen { position: relative; width: ${screenW}px; height: ${screenH}px; border-radius: ${screenR}px; overflow: hidden; background: #000 url('${screenUrl}') top left / 100% auto no-repeat; }
.status { position: absolute; left: 0; top: 0; width: ${screenW}px; height: ${54 * pt}px; }
.island { position: absolute; left: 50%; top: ${11 * pt}px; width: ${126 * pt}px; height: ${37 * pt}px; margin-left: ${-63 * pt}px; border-radius: ${19 * pt}px; background: #000; }
.badge { position: absolute; display: flex; align-items: center; gap: ${18 * u}px; padding: ${24 * u}px ${38 * u}px ${24 * u}px ${30 * u}px; border-radius: 999px; background: ${t.chip}; color: ${t.chipInk};
	font-family: 'Inter Variable'; font-weight: 650; font-size: ${42 * u}px; white-space: nowrap; box-shadow: 0 ${18 * u}px ${50 * u}px rgba(20, 30, 25, 0.22); backdrop-filter: blur(${20 * u}px); }
.dot { width: ${26 * u}px; height: ${26 * u}px; border-radius: 50%; }
.zoom { position: absolute; border-radius: ${44 * u}px; background-color: #000; background-image: url('${screenUrl}'); background-repeat: no-repeat;
	box-shadow: 0 0 0 ${3 * u}px rgba(255,255,255,0.12), 0 ${40 * u}px ${110 * u}px rgba(10, 20, 15, 0.45); }
</style></head>
<body>
<div class="text"><h1>${accentMarkup(slide.headline[locale])}</h1>${slide.subline ? `<p>${escape(slide.subline[locale])}</p>` : ''}</div>
<div class="phone"><div class="screen">${slide.statusBar ? statusBar(slide.statusBar) : ''}<div class="island"></div></div></div>
${zoom}
${badges}
</body></html>`;
}

import { macro, type Locale, type Slide } from './config';

type Ctx = {
	slide: Slide;
	locale: Locale;
	width: number;
	height: number;
	screenUrl: string;
	screenSize: { width: number; height: number };
	device: 'iphone' | 'android';
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

function fontFaces(fontsDir: string) {
	return `@font-face { font-family: 'Manrope Variable'; font-weight: 200 800; src: url('${fontsDir}/manrope/files/manrope-latin-wght-normal.woff2') format('woff2'); }
@font-face { font-family: 'Manrope Variable'; font-weight: 200 800; src: url('${fontsDir}/manrope/files/manrope-latin-ext-wght-normal.woff2') format('woff2'); unicode-range: U+0100-024F; }
@font-face { font-family: 'Inter Variable'; font-weight: 100 900; src: url('${fontsDir}/inter/files/inter-latin-wght-normal.woff2') format('woff2'); }`;
}

type PhoneBox = {
	left: number;
	top: number;
	width: number;
	screenUrl: string;
	screenSize: { width: number; height: number };
	android: boolean;
	rotate?: number;
	shadow?: number;
	z?: number;
};

// A framed phone as one absolutely positioned element with inline styles, so
// several can share a canvas. Returns the markup and the frame's height.
function phoneBox(p: PhoneBox) {
	const w = p.width;
	const bezel = w * (p.android ? 0.024 : 0.03);
	const screenW = w - bezel * 2;
	const screenH = (screenW * p.screenSize.height) / p.screenSize.width;
	const h = screenH + bezel * 2;
	const outerR = w * (p.android ? 0.095 : 0.155);
	const pt = screenW / 402;
	const k = w / 1056;
	const shadow = p.shadow ?? 0.28;
	const button = (side: string, top: number, height: number) =>
		`<i style="position:absolute;${side}:${-6 * k}px;top:${top}px;width:${7 * k}px;height:${height}px;background:#2b2d31;border-radius:${4 * k}px"></i>`;
	const html = `<div class="pb" style="position:absolute;left:${p.left}px;top:${p.top}px;width:${w}px;height:${h}px;border-radius:${outerR}px;background:#1a1b1d;padding:${bezel}px;z-index:${p.z ?? 1};transform:rotate(${p.rotate ?? 0}deg);box-shadow:inset 0 0 0 ${2 * k}px #4a4d52, inset 0 0 0 ${7 * k}px #111214${shadow ? `, 0 ${60 * k}px ${140 * k}px rgba(20, 30, 25, ${shadow}), 0 ${16 * k}px ${40 * k}px rgba(20, 30, 25, 0.18)` : ''}">
	${button('left', w * 0.42, w * 0.14)}${button('left', w * 0.61, w * 0.14)}${button('right', w * 0.5, w * 0.22)}
	<div style="position:relative;width:${screenW}px;height:${screenH}px;border-radius:${outerR - bezel}px;overflow:hidden;background:#000 url('${p.screenUrl}') top left / 100% auto no-repeat">${p.android ? '' : `<div style="position:absolute;left:50%;top:${11 * pt}px;width:${126 * pt}px;height:${37 * pt}px;margin-left:${-63 * pt}px;border-radius:${19 * pt}px;background:#000"></div>`}</div>
</div>`;
	return { html, height: h };
}

export type Screen = { url: string; size: { width: number; height: number } };

const macroColors = [macro.calories, macro.protein, macro.carbs, macro.fat, macro.fiber];

// Concentric arcs in the macro colours, echoing the calorie ring.
function rings(cx: number, cy: number, r: number, gap: number, stroke: number, opacity: number) {
	return macroColors
		.map(
			(c, i) =>
				`<circle cx="${cx}" cy="${cy}" r="${r + i * gap}" fill="none" stroke="${c}" stroke-width="${stroke}" stroke-opacity="${opacity}"/>`
		)
		.join('');
}

type Banner = {
	width: number;
	height: number;
	title: string;
	tagline: string;
	note?: string;
	iconUrl: string;
	fontsDir: string;
	device: 'iphone' | 'android';
	screens: [Screen, Screen, Screen];
};

// Wide brand banner: wordmark on the left, three phones rising from the
// bottom edge on the right. Used for the Play feature graphic and the
// website's link preview.
export function renderBanner(b: Banner) {
	const { width: W, height: H } = b;
	const u = H / 500;
	const android = b.device === 'android';
	const pw = 172 * u;
	const cx = W - 262 * u;
	const side = 146 * u;
	const phones = [
		phoneBox({
			left: cx - side - pw / 2,
			top: 128 * u,
			width: pw,
			screenUrl: b.screens[1].url,
			screenSize: b.screens[1].size,
			android,
			rotate: -7,
			shadow: 0.3,
			z: 1
		}),
		phoneBox({
			left: cx + side - pw / 2,
			top: 128 * u,
			width: pw,
			screenUrl: b.screens[2].url,
			screenSize: b.screens[2].size,
			android,
			rotate: 7,
			shadow: 0.3,
			z: 1
		}),
		phoneBox({
			left: cx - (pw * 1.16) / 2,
			top: 56 * u,
			width: pw * 1.16,
			screenUrl: b.screens[0].url,
			screenSize: b.screens[0].size,
			android,
			shadow: 0.36,
			z: 2
		})
	]
		.map((p) => p.html)
		.join('');
	const dots = macroColors.map((c) => `<span style="background:${c}"></span>`).join('');
	return `<!doctype html>
<html><head><meta charset="utf-8"><style>
${fontFaces(b.fontsDir)}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
body { background: ${themes.light.bg}; position: relative; -webkit-font-smoothing: antialiased; }
svg { position: absolute; inset: 0; }
.copy { position: absolute; left: ${64 * u}px; top: 0; bottom: 0; width: ${W - 560 * u}px; display: flex; flex-direction: column; justify-content: center; z-index: 3; }
.brand { display: flex; align-items: center; gap: ${22 * u}px; }
.brand img { width: ${80 * u}px; height: ${80 * u}px; filter: drop-shadow(0 ${10 * u}px ${22 * u}px rgba(60, 45, 20, 0.16)); }
h1 { font-family: 'Manrope Variable'; font-weight: 800; font-size: ${52 * u}px; line-height: 1; letter-spacing: -0.03em; color: ${themes.light.ink}; }
h2 { margin-top: ${30 * u}px; font-family: 'Manrope Variable'; font-weight: 700; font-size: ${35 * u}px; line-height: 1.16; letter-spacing: -0.02em; color: ${themes.light.ink}; text-wrap: balance; }
h2 em { font-style: normal; color: ${themes.light.accent}; }
p { margin-top: ${16 * u}px; font-family: 'Inter Variable'; font-weight: 500; font-size: ${17.5 * u}px; color: ${themes.light.muted}; white-space: nowrap; }
.dots { display: flex; gap: ${10 * u}px; margin-top: ${26 * u}px; }
.dots span { width: ${13 * u}px; height: ${13 * u}px; border-radius: 50%; }
</style></head>
<body>
<svg viewBox="0 0 ${W} ${H}">${rings(cx, H * 1.05, 250 * u, 26 * u, 5 * u, 0.4)}</svg>
<div class="copy"><div class="brand"><img src="${b.iconUrl}"><h1>${escape(b.title)}</h1></div><h2>${accentMarkup(b.tagline)}</h2>${b.note ? `<p>${escape(b.note)}</p>` : ''}<div class="dots">${dots}</div></div>
${phones}
</body></html>`;
}

type Panorama = {
	width: number;
	height: number;
	locale: Locale;
	device: 'iphone' | 'android';
	fontsDir: string;
	slides: Slide[];
	front: Screen[];
	back: Screen[];
};

// The first three slides as one continuous canvas: stores show them side by
// side in search results, so phones peek across the seams and the rings run
// through all three. Cut into equal thirds after rendering.
export function renderPanorama(p: Panorama) {
	const { width: W, height: H, locale } = p;
	const android = p.device === 'android';
	const u = W / 1320;
	const t = themes.light;
	const frontW = 0.76 * W;
	const backW = 0.66 * W;
	const front = p.front
		.map(
			(s, i) =>
				phoneBox({
					left: i * W + (W - frontW) / 2,
					top: 0.262 * H,
					width: frontW,
					screenUrl: s.url,
					screenSize: s.size,
					android,
					shadow: 0.32,
					z: 2
				}).html
		)
		.join('');
	const back = p.back
		.map(
			(s, i) =>
				phoneBox({
					left: (i + 1) * W - backW / 2,
					top: 0.345 * H,
					width: backW,
					screenUrl: s.url,
					screenSize: s.size,
					android,
					shadow: 0.2,
					z: 1
				}).html
		)
		.join('');
	const text = p.slides
		.map(
			(s, i) =>
				`<div class="text" style="left:${i * W + 96 * u}px"><h1>${accentMarkup(s.headline[locale])}</h1>${s.subline ? `<p>${escape(s.subline[locale])}</p>` : ''}</div>`
		)
		.join('');
	return `<!doctype html>
<html><head><meta charset="utf-8"><style>
${fontFaces(p.fontsDir)}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${W * 3}px; height: ${H}px; overflow: hidden; }
body { background: ${t.bg}; position: relative; -webkit-font-smoothing: antialiased; }
svg { position: absolute; inset: 0; }
.text { position: absolute; top: ${190 * u}px; width: ${W - 192 * u}px; z-index: 3; }
h1 { font-family: 'Manrope Variable'; font-weight: 800; font-size: ${118 * u}px; line-height: 1.04; letter-spacing: -0.03em; color: ${t.ink}; text-wrap: balance; }
h1 em { font-style: normal; color: ${t.accent}; }
p { margin-top: ${36 * u}px; font-family: 'Inter Variable'; font-weight: 500; font-size: ${44 * u}px; line-height: 1.3; color: ${t.muted}; text-wrap: balance; }
</style></head>
<body>
<svg viewBox="0 0 ${W * 3} ${H}">${rings(W * 1.5, 640 * u + 2.2 * W, 2.2 * W - 136 * u, 34 * u, 9 * u, 0.42)}</svg>
${text}
${back}
${front}
</body></html>`;
}

// One framed phone on a transparent page, for the website.
export function renderPhone(screen: Screen, width: number, device: 'iphone' | 'android') {
	const pad = Math.ceil(width * 0.008);
	const box = phoneBox({
		left: pad,
		top: pad,
		width,
		screenUrl: screen.url,
		screenSize: screen.size,
		android: device === 'android',
		shadow: 0
	});
	return {
		width: Math.ceil(width + pad * 2),
		height: Math.ceil(box.height + pad * 2),
		html: `<!doctype html><html><head><meta charset="utf-8"><style>* { margin: 0; padding: 0; box-sizing: border-box; } html, body { background: transparent; }</style></head><body>${box.html}</body></html>`
	};
}

export function renderSlide(ctx: Ctx) {
	const { slide, locale, width: W, height: H, screenUrl, screenSize, device, fontsDir } = ctx;
	const android = device === 'android';
	const t = themes[slide.theme ?? 'light'];
	const textBottom = slide.textPosition === 'bottom';

	const phoneW = (slide.phone?.width ?? 0.8) * W;
	const bezel = phoneW * (android ? 0.024 : 0.03);
	const screenW = phoneW - bezel * 2;
	const screenH = (screenW * screenSize.height) / screenSize.width;
	const phoneH = screenH + bezel * 2;
	const outerR = phoneW * (android ? 0.095 : 0.155);
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
${fontFaces(fontsDir)}
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
<div class="phone"><div class="screen">${slide.statusBar ? statusBar(slide.statusBar) : ''}${android ? '' : '<div class="island"></div>'}</div></div>
${zoom}
${badges}
</body></html>`;
}

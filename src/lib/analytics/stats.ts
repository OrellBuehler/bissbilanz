/**
 * Small, dependency-free inference helpers shared by the insight analytics.
 * Every function here has a line-for-line Kotlin twin in
 * `mobile/shared/.../analytics/Stats.kt`; the golden-vector parity suite holds
 * the two together, so keep the arithmetic identical (same approximations,
 * same operation order) when changing either side.
 */

/**
 * Standard normal CDF via the Abramowitz & Stegun 7.1.26 erf approximation
 * (|error| < 1.5e-7). Used for the DII percentile transform.
 */
export function normalCdf(z: number): number {
	const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
	const poly =
		t *
		(0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
	const erf = 1 - poly * Math.exp(-(z * z) / 2);
	return 0.5 * (1 + (z < 0 ? -erf : erf));
}

/** Two-sided p-value of a Student t statistic with `df` degrees of freedom. */
export function studentTwoSidedP(t: number, df: number): number {
	if (df <= 0 || !Number.isFinite(t)) return 1;
	const x = df / (df + t * t);
	const p = incompleteBeta(df / 2, 0.5, x);
	return Math.min(1, Math.max(0, p));
}

export type WelchResult = { t: number; df: number; pValue: number };

/**
 * Welch's unequal-variance t-test between two samples. Returns `pValue = 1`
 * when either sample has fewer than two points or both have zero variance.
 */
export function welchTTest(a: number[], b: number[]): WelchResult {
	const na = a.length;
	const nb = b.length;
	if (na < 2 || nb < 2) return { t: 0, df: 0, pValue: 1 };
	const ma = mean(a);
	const mb = mean(b);
	const va = sampleVariance(a, ma);
	const vb = sampleVariance(b, mb);
	const se2 = va / na + vb / nb;
	if (se2 === 0) return { t: 0, df: na + nb - 2, pValue: 1 };
	const t = (ma - mb) / Math.sqrt(se2);
	const df = (se2 * se2) / ((va * va) / (na * na * (na - 1)) + (vb * vb) / (nb * nb * (nb - 1)));
	return { t, df, pValue: studentTwoSidedP(t, df) };
}

/**
 * Benjamini–Hochberg adjusted p-values (q-values), in the input order. Controls
 * the false-discovery rate across a family of screening tests.
 */
export function benjaminiHochberg(pValues: number[]): number[] {
	const m = pValues.length;
	if (m === 0) return [];
	const order = pValues.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p);
	const q = new Array<number>(m);
	let running = 1;
	for (let k = m - 1; k >= 0; k--) {
		const adjusted = Math.min(1, (order[k].p * m) / (k + 1));
		running = Math.min(running, adjusted);
		q[order[k].i] = running;
	}
	return q;
}

/**
 * 95% confidence interval for a Pearson r via the Fisher z-transform. Returns
 * the full [-1, 1] interval when n < 4 (the transform is undefined there).
 */
export function fisherCI95(r: number, n: number): [number, number] {
	if (n < 4) return [-1, 1];
	const clamped = Math.max(-0.999999, Math.min(0.999999, r));
	const z = 0.5 * Math.log((1 + clamped) / (1 - clamped));
	const se = 1 / Math.sqrt(n - 3);
	const lo = z - 1.959964 * se;
	const hi = z + 1.959964 * se;
	return [Math.tanh(lo), Math.tanh(hi)];
}

export function mean(values: number[]): number {
	return values.reduce((s, v) => s + v, 0) / values.length;
}

function sampleVariance(values: number[], m: number): number {
	if (values.length < 2) return 0;
	return values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
}

// --- incomplete beta (Numerical Recipes: modified Lentz continued fraction) ---

export function incompleteBeta(a: number, b: number, x: number): number {
	if (x < 0 || x > 1) return 0;
	if (x === 0) return 0;
	if (x === 1) return 1;

	const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b);
	const bt = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta);

	if (x < (a + 1) / (a + b + 2)) {
		return (bt * betaCF(a, b, x)) / a;
	} else {
		return 1 - (bt * betaCF(b, a, 1 - x)) / b;
	}
}

function betaCF(a: number, b: number, x: number): number {
	const maxIter = 200;
	const eps = 3e-7;

	const qab = a + b;
	const qap = a + 1;
	const qam = a - 1;
	let c = 1.0;
	let d = 1.0 - (qab * x) / qap;
	if (Math.abs(d) < 1e-30) d = 1e-30;
	d = 1.0 / d;
	let h = d;

	for (let m = 1; m <= maxIter; m++) {
		const m2 = 2 * m;
		let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
		d = 1.0 + aa * d;
		if (Math.abs(d) < 1e-30) d = 1e-30;
		c = 1.0 + aa / c;
		if (Math.abs(c) < 1e-30) c = 1e-30;
		d = 1.0 / d;
		h *= d * c;

		aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
		d = 1.0 + aa * d;
		if (Math.abs(d) < 1e-30) d = 1e-30;
		c = 1.0 + aa / c;
		if (Math.abs(c) < 1e-30) c = 1e-30;
		d = 1.0 / d;
		const del = d * c;
		h *= del;

		if (Math.abs(del - 1.0) < eps) break;
	}

	return h;
}

function lgamma(z: number): number {
	const g = 7;
	const c = [
		0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
		-176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
		1.5056327351493116e-7
	];

	if (z < 0.5) {
		return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
	}

	z -= 1;
	let x = c[0];
	for (let i = 1; i < g + 2; i++) {
		x += c[i] / (z + i);
	}

	const t = z + g + 0.5;
	return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

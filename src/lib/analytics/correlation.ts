export type ConfidenceLevel = 'insufficient' | 'low' | 'medium' | 'high';

export type CorrelationResult = {
	r: number;
	pValue: number;
	sampleSize: number;
	confidence: ConfidenceLevel;
	constantInput: boolean;
};

export function getConfidenceLevel(sampleSize: number): ConfidenceLevel {
	if (sampleSize < 7) return 'insufficient';
	if (sampleSize < 14) return 'low';
	if (sampleSize < 30) return 'medium';
	return 'high';
}

export function pearsonCorrelation(x: number[], y: number[]): CorrelationResult {
	if (x.length !== y.length) {
		throw new Error(`Array lengths must match: got ${x.length} and ${y.length}`);
	}

	const n = x.length;
	const confidence = getConfidenceLevel(n);

	const xMean = x.reduce((sum, v) => sum + v, 0) / n;
	const yMean = y.reduce((sum, v) => sum + v, 0) / n;

	let sumXY = 0;
	let sumX2 = 0;
	let sumY2 = 0;

	for (let i = 0; i < n; i++) {
		const dx = x[i] - xMean;
		const dy = y[i] - yMean;
		sumXY += dx * dy;
		sumX2 += dx * dx;
		sumY2 += dy * dy;
	}

	if (sumX2 === 0 || sumY2 === 0) {
		return { r: 0, pValue: 1, sampleSize: n, confidence: 'insufficient', constantInput: true };
	}

	const r = sumXY / Math.sqrt(sumX2 * sumY2);
	const clampedR = Math.max(-1, Math.min(1, r));

	let pValue: number;
	if (n <= 2) {
		pValue = 1;
	} else {
		const r2 = clampedR * clampedR;
		const t = clampedR * Math.sqrt((n - 2) / Math.max(1 - r2, 1e-10));
		pValue = tDistPValue(t, n - 2);
	}

	return { r: clampedR, pValue, sampleSize: n, confidence, constantInput: false };
}

function tDistPValue(t: number, df: number): number {
	const x = df / (df + t * t);
	const p = incompleteBeta(df / 2, 0.5, x);
	return Math.min(1, Math.max(0, p));
}

function incompleteBeta(a: number, b: number, x: number): number {
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

	let qab = a + b;
	let qap = a + 1;
	let qam = a - 1;
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

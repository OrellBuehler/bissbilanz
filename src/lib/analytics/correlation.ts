import { fisherCI95, studentTwoSidedP } from './stats';

export type ConfidenceLevel = 'insufficient' | 'low' | 'medium' | 'high';

export type CorrelationResult = {
	r: number;
	pValue: number;
	/** 95% Fisher-z confidence interval on r; [-1, 1] when n < 4. */
	ciLow: number;
	ciHigh: number;
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
		return {
			r: 0,
			pValue: 1,
			ciLow: 0,
			ciHigh: 0,
			sampleSize: n,
			confidence: 'insufficient',
			constantInput: true
		};
	}

	const r = sumXY / Math.sqrt(sumX2 * sumY2);
	const clampedR = Math.max(-1, Math.min(1, r));

	let pValue: number;
	if (n <= 2) {
		pValue = 1;
	} else {
		const r2 = clampedR * clampedR;
		const t = clampedR * Math.sqrt((n - 2) / Math.max(1 - r2, 1e-10));
		pValue = studentTwoSidedP(t, n - 2);
	}

	const [ciLow, ciHigh] = fisherCI95(clampedR, n);
	return { r: clampedR, pValue, ciLow, ciHigh, sampleSize: n, confidence, constantInput: false };
}

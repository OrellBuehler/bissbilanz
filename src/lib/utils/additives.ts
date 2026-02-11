export type AdditiveRisk = 'low' | 'moderate' | 'high';

export type AdditiveInfo = {
	name: string;
	risk: AdditiveRisk;
};

// Common additives with risk levels based on EFSA/IARC assessments
// Tags use Open Food Facts format: "en:e{number}"
const ADDITIVES: Record<string, AdditiveInfo> = {
	// Colorants
	'en:e100': { name: 'Curcumin', risk: 'low' },
	'en:e101': { name: 'Riboflavin', risk: 'low' },
	'en:e102': { name: 'Tartrazine', risk: 'high' },
	'en:e104': { name: 'Quinoline Yellow', risk: 'high' },
	'en:e110': { name: 'Sunset Yellow', risk: 'high' },
	'en:e120': { name: 'Cochineal', risk: 'moderate' },
	'en:e122': { name: 'Carmoisine', risk: 'high' },
	'en:e124': { name: 'Ponceau 4R', risk: 'high' },
	'en:e129': { name: 'Allura Red', risk: 'high' },
	'en:e131': { name: 'Patent Blue V', risk: 'moderate' },
	'en:e132': { name: 'Indigo Carmine', risk: 'moderate' },
	'en:e133': { name: 'Brilliant Blue', risk: 'low' },
	'en:e140': { name: 'Chlorophyll', risk: 'low' },
	'en:e141': { name: 'Copper Chlorophyll', risk: 'low' },
	'en:e150a': { name: 'Caramel Color', risk: 'low' },
	'en:e150b': { name: 'Caustic Sulfite Caramel', risk: 'moderate' },
	'en:e150c': { name: 'Ammonia Caramel', risk: 'moderate' },
	'en:e150d': { name: 'Sulfite Ammonia Caramel', risk: 'moderate' },
	'en:e160a': { name: 'Beta-Carotene', risk: 'low' },
	'en:e160b': { name: 'Annatto', risk: 'low' },
	'en:e160c': { name: 'Paprika Extract', risk: 'low' },
	'en:e171': { name: 'Titanium Dioxide', risk: 'high' },

	// Preservatives
	'en:e200': { name: 'Sorbic Acid', risk: 'low' },
	'en:e202': { name: 'Potassium Sorbate', risk: 'low' },
	'en:e210': { name: 'Benzoic Acid', risk: 'moderate' },
	'en:e211': { name: 'Sodium Benzoate', risk: 'moderate' },
	'en:e220': { name: 'Sulfur Dioxide', risk: 'moderate' },
	'en:e221': { name: 'Sodium Sulfite', risk: 'moderate' },
	'en:e223': { name: 'Sodium Metabisulfite', risk: 'moderate' },
	'en:e224': { name: 'Potassium Metabisulfite', risk: 'moderate' },
	'en:e249': { name: 'Potassium Nitrite', risk: 'high' },
	'en:e250': { name: 'Sodium Nitrite', risk: 'high' },
	'en:e251': { name: 'Sodium Nitrate', risk: 'high' },
	'en:e252': { name: 'Potassium Nitrate', risk: 'high' },

	// Antioxidants
	'en:e300': { name: 'Ascorbic Acid', risk: 'low' },
	'en:e301': { name: 'Sodium Ascorbate', risk: 'low' },
	'en:e306': { name: 'Tocopherol', risk: 'low' },
	'en:e307': { name: 'Alpha-Tocopherol', risk: 'low' },
	'en:e320': { name: 'BHA', risk: 'high' },
	'en:e321': { name: 'BHT', risk: 'moderate' },
	'en:e322': { name: 'Lecithin', risk: 'low' },
	'en:e330': { name: 'Citric Acid', risk: 'low' },
	'en:e331': { name: 'Sodium Citrate', risk: 'low' },
	'en:e332': { name: 'Potassium Citrate', risk: 'low' },
	'en:e338': { name: 'Phosphoric Acid', risk: 'moderate' },
	'en:e339': { name: 'Sodium Phosphate', risk: 'moderate' },

	// Emulsifiers & stabilizers
	'en:e400': { name: 'Alginic Acid', risk: 'low' },
	'en:e401': { name: 'Sodium Alginate', risk: 'low' },
	'en:e407': { name: 'Carrageenan', risk: 'moderate' },
	'en:e410': { name: 'Locust Bean Gum', risk: 'low' },
	'en:e412': { name: 'Guar Gum', risk: 'low' },
	'en:e414': { name: 'Gum Arabic', risk: 'low' },
	'en:e415': { name: 'Xanthan Gum', risk: 'low' },
	'en:e440': { name: 'Pectin', risk: 'low' },
	'en:e450': { name: 'Diphosphates', risk: 'moderate' },
	'en:e451': { name: 'Triphosphates', risk: 'moderate' },
	'en:e452': { name: 'Polyphosphates', risk: 'moderate' },
	'en:e460': { name: 'Cellulose', risk: 'low' },
	'en:e466': { name: 'Carboxymethyl Cellulose', risk: 'moderate' },
	'en:e471': { name: 'Mono- and Diglycerides', risk: 'low' },
	'en:e472e': { name: 'DATEM', risk: 'low' },

	// Sweeteners
	'en:e950': { name: 'Acesulfame K', risk: 'moderate' },
	'en:e951': { name: 'Aspartame', risk: 'high' },
	'en:e952': { name: 'Cyclamate', risk: 'high' },
	'en:e954': { name: 'Saccharin', risk: 'moderate' },
	'en:e955': { name: 'Sucralose', risk: 'moderate' },
	'en:e960': { name: 'Steviol Glycosides', risk: 'low' },
	'en:e961': { name: 'Neotame', risk: 'moderate' },
	'en:e965': { name: 'Maltitol', risk: 'low' },
	'en:e966': { name: 'Lactitol', risk: 'low' },
	'en:e967': { name: 'Xylitol', risk: 'low' },
	'en:e968': { name: 'Erythritol', risk: 'low' }
};

export function getAdditiveInfo(tag: string): AdditiveInfo {
	const normalized = tag.toLowerCase();
	return ADDITIVES[normalized] ?? { name: extractAdditiveName(normalized), risk: 'moderate' as const };
}

function extractAdditiveName(tag: string): string {
	// "en:e322" -> "E322"
	const match = tag.match(/e\d+\w*/i);
	return match ? match[0].toUpperCase() : tag;
}

export function getRiskColor(risk: AdditiveRisk): string {
	switch (risk) {
		case 'low':
			return 'text-green-600 bg-green-50 border-green-200';
		case 'moderate':
			return 'text-amber-600 bg-amber-50 border-amber-200';
		case 'high':
			return 'text-red-600 bg-red-50 border-red-200';
	}
}

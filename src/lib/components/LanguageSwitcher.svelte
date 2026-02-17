<script lang="ts">
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { getLocale, setLocale } from '$lib/paraglide/runtime';

	type Props = {
		savePreference: (key: string, value: string) => Promise<void>;
	};

	let { savePreference }: Props = $props();

	const currentLocale = $derived(getLocale());

	const handleChange = async (value: string) => {
		if (value === currentLocale) return;
		await savePreference('locale', value);
		setLocale(value as 'en' | 'de');
	};
</script>

<RadioGroup.Root value={currentLocale} onValueChange={handleChange} class="flex flex-col gap-3">
	<div class="flex items-center gap-2">
		<RadioGroup.Item value="en" id="lang-en" />
		<Label for="lang-en">English</Label>
	</div>
	<div class="flex items-center gap-2">
		<RadioGroup.Item value="de" id="lang-de" />
		<Label for="lang-de">Deutsch</Label>
	</div>
</RadioGroup.Root>

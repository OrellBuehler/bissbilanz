import type postgres from 'postgres';

export const U1 = '00000000-0000-0000-0001-000000000001';
export const U2 = '00000000-0000-0000-0001-000000000002';
export const F1 = '00000000-0000-0000-0002-000000000001';
export const F2 = '00000000-0000-0000-0002-000000000002';
export const SF1 = '00000000-0000-0000-0002-000000000003';
export const SF2 = '00000000-0000-0000-0002-000000000004';

export const SUP1 = '00000000-0000-0000-0007-000000000001';
export const SUP2 = '00000000-0000-0000-0007-000000000002';
export const SI1 = '00000000-0000-0000-0007-000000000011';
export const SI2A = '00000000-0000-0000-0007-00000000002a';
export const SI2B = '00000000-0000-0000-0007-00000000002b';

const S1 = '00000000-0000-0000-0003-000000000001';
const E1 = '00000000-0000-0000-0004-000000000001';
const R1 = '00000000-0000-0000-0005-000000000001';
const RI1 = '00000000-0000-0000-0006-000000000001';
const G1 = U1;
const UP1 = U1;
const W1 = '00000000-0000-0000-0009-000000000001';
const OC1 = '00000000-0000-0000-000a-000000000001';
const CMT1 = '00000000-0000-0000-000b-000000000001';

// Seeds representative rows in the CURRENT base schema (everything up to but not
// including the PR's new migrations). test-migrations.ts applies base migrations,
// seeds, then applies the new migrations — so the new SQL runs against real data
// and we verify the seeded rows survive. Keep this in sync with the schema; if a
// new migration drops/renames a column referenced here, update the seed too.
export async function seedData(db: ReturnType<typeof postgres>) {
	await db`
		INSERT INTO users (id, infomaniak_sub, email, name, locale)
		VALUES
			(${U1}, 'sub-test-1', 'user1@example.com', 'Test User 1', 'en'),
			(${U2}, 'sub-test-2', 'user2@example.com', 'Test User 2', 'de')
	`;

	await db`
		INSERT INTO sessions (id, user_id, refresh_token, expires_at)
		VALUES (${S1}, ${U1}, 'refresh-token-test-1', NOW() + INTERVAL '7 days')
	`;

	await db`
		INSERT INTO user_preferences (user_id)
		VALUES (${UP1})
	`;

	await db`
		INSERT INTO foods (id, user_id, name, serving_size, serving_unit, calories, protein, carbs, fat, fiber)
		VALUES
			(${F1}, ${U1}, 'Oats', 100, 'g', 370, 13, 66, 7, 10),
			(${F2}, ${U1}, 'Chicken Breast', 100, 'g', 165, 31, 0, 3.6, 0)
	`;

	// Supplement ingredients are backed by foods with kind='supplement'.
	await db`
		INSERT INTO foods (id, user_id, name, kind, serving_size, serving_unit, calories, protein, carbs, fat, fiber)
		VALUES
			(${SF1}, ${U1}, 'Vitamin D3', 'supplement', 1, 'g', 0, 0, 0, 0, 0),
			(${SF2}, ${U1}, 'Vitamin C', 'supplement', 1, 'g', 0, 0, 0, 0, 0)
	`;

	await db`
		INSERT INTO food_entries (id, user_id, food_id, date, meal_type, servings)
		VALUES (${E1}, ${U1}, ${F1}, CURRENT_DATE, 'Breakfast', 1)
	`;

	await db`
		INSERT INTO recipes (id, user_id, name, total_servings)
		VALUES (${R1}, ${U1}, 'Protein Bowl', 2)
	`;

	await db`
		INSERT INTO recipe_ingredients (id, recipe_id, food_id, quantity, serving_unit, sort_order)
		VALUES (${RI1}, ${R1}, ${F2}, 200, 'g', 0)
	`;

	await db`
		INSERT INTO user_goals (user_id, calorie_goal, protein_goal, carb_goal, fat_goal, fiber_goal)
		VALUES (${G1}, 2000, 150, 200, 60, 30)
	`;

	await db`
		INSERT INTO supplements (id, user_id, name, schedule_type, sort_order)
		VALUES
			(${SUP1}, ${U1}, 'Vitamin D', 'daily', 0),
			(${SUP2}, ${U1}, 'Multivitamin', 'daily', 1)
	`;

	await db`
		INSERT INTO supplement_ingredients (id, supplement_id, food_id, servings, sort_order)
		VALUES
			(${SI1}, ${SUP1}, ${SF1}, 1, 0),
			(${SI2A}, ${SUP2}, ${SF1}, 1, 0),
			(${SI2B}, ${SUP2}, ${SF2}, 1, 1)
	`;

	await db`
		INSERT INTO weight_entries (id, user_id, weight_kg, entry_date, logged_at)
		VALUES (${W1}, ${U1}, 75.5, CURRENT_DATE, NOW())
	`;

	await db`
		INSERT INTO oauth_clients (id, user_id, client_id, client_secret_hash, client_name)
		VALUES (${OC1}, ${U1}, 'test-client-id-1', 'hashed-secret', 'Test MCP Client')
	`;

	await db`
		INSERT INTO custom_meal_types (id, user_id, name, sort_order)
		VALUES (${CMT1}, ${U1}, 'Pre-workout', 10)
	`;

	console.log(
		'Seeded: 2 users, 1 session, 1 user_preferences, 4 foods (2 supplement-backing), 1 food_entry, 1 recipe, 1 recipe_ingredient, 1 user_goals, 2 supplements (3 ingredients), 1 weight_entry, 1 oauth_client, 1 custom_meal_type'
	);
}

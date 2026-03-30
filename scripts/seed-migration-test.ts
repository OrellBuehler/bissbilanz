import type { SQL } from 'bun';

export const U1 = '00000000-0000-0000-0001-000000000001';
export const U2 = '00000000-0000-0000-0001-000000000002';
export const F1 = '00000000-0000-0000-0002-000000000001';
export const F2 = '00000000-0000-0000-0002-000000000002';

const S1 = '00000000-0000-0000-0003-000000000001';
const E1 = '00000000-0000-0000-0004-000000000001';
const R1 = '00000000-0000-0000-0005-000000000001';
const RI1 = '00000000-0000-0000-0006-000000000001';
const G1 = U1;
const SUP1 = '00000000-0000-0000-0007-000000000001';
const SL1 = '00000000-0000-0000-0008-000000000001';
const W1 = '00000000-0000-0000-0009-000000000001';
const OC1 = '00000000-0000-0000-000a-000000000001';
const CMT1 = '00000000-0000-0000-000b-000000000001';

export async function seedData(db: SQL) {
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
		INSERT INTO foods (id, user_id, name, serving_size, serving_unit, calories, protein, carbs, fat, fiber)
		VALUES
			(${F1}, ${U1}, 'Oats', 100, 'g', 370, 13, 66, 7, 10),
			(${F2}, ${U1}, 'Chicken Breast', 100, 'g', 165, 31, 0, 3.6, 0)
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
		INSERT INTO supplements (id, user_id, name, dosage, dosage_unit, schedule_type, sort_order)
		VALUES (${SUP1}, ${U1}, 'Vitamin D', 1000, 'IU', 'daily', 0)
	`;

	await db`
		INSERT INTO supplement_logs (id, supplement_id, user_id, date, taken_at)
		VALUES (${SL1}, ${SUP1}, ${U1}, CURRENT_DATE, NOW())
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
		'Seeded: 2 users, 1 session, 2 foods, 1 food_entry, 1 recipe, 1 recipe_ingredient, 1 user_goals, 1 supplement, 1 supplement_log, 1 weight_entry, 1 oauth_client, 1 custom_meal_type'
	);
}

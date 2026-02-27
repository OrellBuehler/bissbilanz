UPDATE food_entries SET meal_type = 'Breakfast' WHERE lower(meal_type) = 'breakfast' AND meal_type != 'Breakfast';
UPDATE food_entries SET meal_type = 'Lunch' WHERE lower(meal_type) = 'lunch' AND meal_type != 'Lunch';
UPDATE food_entries SET meal_type = 'Dinner' WHERE lower(meal_type) = 'dinner' AND meal_type != 'Dinner';
UPDATE food_entries SET meal_type = 'Snacks' WHERE lower(meal_type) IN ('snack', 'snacks') AND meal_type != 'Snacks';

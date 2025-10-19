package models

import "time"

// AppUser represents an end user of the application that can log foods.
type AppUser struct {
	ID          string    `db:"id"`
	Email       *string   `db:"email"`
	DisplayName *string   `db:"display_name"`
	CreatedAt   time.Time `db:"created_at"`
	UpdatedAt   time.Time `db:"updated_at"`
}

// UserFoodLog captures a user's consumption of a specific food item.
type UserFoodLog struct {
	ID            string    `db:"id"`
	UserID        string    `db:"user_id"`
	FoodID        string    `db:"food_id"`
	LoggedAt      time.Time `db:"logged_at"`
	QuantityGrams float64   `db:"quantity_grams"`
	PortionID     *int64    `db:"portion_id"`
	Notes         *string   `db:"notes"`
	Source        *string   `db:"source"`
	CreatedAt     time.Time `db:"created_at"`
}

// UserFoodLogTag stores labels that users can apply to their food log entries.
type UserFoodLogTag struct {
	LogID string `db:"log_id"`
	Tag   string `db:"tag"`
}

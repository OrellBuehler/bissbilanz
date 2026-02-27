CREATE INDEX "idx_foods_image_url" ON "foods" USING btree ("image_url");--> statement-breakpoint
CREATE INDEX "idx_recipes_image_url" ON "recipes" USING btree ("image_url");
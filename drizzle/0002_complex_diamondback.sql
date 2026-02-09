CREATE TABLE "oauth_authorization_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "oauth_codes_method_check" CHECK (code_challenge_method = 'S256')
);
--> statement-breakpoint
CREATE TABLE "oauth_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"client_id" text NOT NULL,
	"client_secret_hash" text,
	"client_name" text,
	"allowed_redirect_uris" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"token_endpoint_auth_method" text DEFAULT 'client_secret_post' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "oauth_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token_hash" text NOT NULL,
	"refresh_token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"refresh_token_expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT ARRAY['mcp:access']::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_oauth_codes_client_id" ON "oauth_authorization_codes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_codes_expires_at" ON "oauth_authorization_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_oauth_authorizations_user_id" ON "oauth_authorizations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_authorizations_client_id" ON "oauth_authorizations" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_oauth_authorizations_user_client" ON "oauth_authorizations" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_clients_user_id" ON "oauth_clients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_clients_client_id" ON "oauth_clients" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_tokens_client_id" ON "oauth_tokens" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_tokens_user_id" ON "oauth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_tokens_expires_at" ON "oauth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_oauth_tokens_access_token_hash" ON "oauth_tokens" USING btree ("access_token_hash");
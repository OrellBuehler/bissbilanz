CREATE TABLE "client_versions" (
	"platform" text NOT NULL,
	"version" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_versions_platform_version_pk" PRIMARY KEY("platform","version")
);

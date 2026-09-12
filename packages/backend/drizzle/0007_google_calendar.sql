ALTER TABLE "integrations" ALTER COLUMN "encrypted_token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ALTER COLUMN "iv" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ALTER COLUMN "auth_tag" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "encrypted_refresh_token" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "refresh_token_iv" varchar(100);--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "refresh_token_auth_tag" varchar(100);--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "encrypted_access_token" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "access_token_iv" varchar(100);--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "access_token_auth_tag" varchar(100);--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "access_token_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"google_event_id" varchar(255) NOT NULL,
	"summary" text NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"location" text,
	"html_link" text,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_user_google_event_unique" UNIQUE("user_id","google_event_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_user_start_time_idx" ON "calendar_events" USING btree ("user_id","start_time");

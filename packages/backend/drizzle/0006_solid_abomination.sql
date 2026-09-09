CREATE TABLE IF NOT EXISTS "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(50) DEFAULT 'github' NOT NULL,
	"encrypted_token" text NOT NULL,
	"iv" varchar(100) NOT NULL,
	"auth_tag" varchar(100) NOT NULL,
	"metadata" jsonb,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_user_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_github_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"repo_owner" varchar(100) NOT NULL,
	"repo_name" varchar(100) NOT NULL,
	"repo_url" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_github_links_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"state" varchar(50) NOT NULL,
	"url" text NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb,
	"author" varchar(100) NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_issues_project_number_unique" UNIQUE("project_id","number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"state" varchar(50) NOT NULL,
	"url" text NOT NULL,
	"author" varchar(100) NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_pull_requests_project_number_unique" UNIQUE("project_id","number")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "github_issue_number" integer;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "github_issue_url" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_github_links" ADD CONSTRAINT "project_github_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_github_links" ADD CONSTRAINT "project_github_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_issues" ADD CONSTRAINT "github_issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_issues" ADD CONSTRAINT "github_issues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrations_user_id_idx" ON "integrations" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_github_links_user_id_idx" ON "project_github_links" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_issues_project_id_idx" ON "github_issues" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_issues_user_id_idx" ON "github_issues" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_pull_requests_project_id_idx" ON "github_pull_requests" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_pull_requests_user_id_idx" ON "github_pull_requests" USING btree ("user_id");
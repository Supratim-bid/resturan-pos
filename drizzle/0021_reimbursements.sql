ALTER TABLE "expenses" ADD COLUMN "reimbursed_at" timestamp;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "reimbursed_by_id" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "reimbursed_mode" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reimbursed_by_id_users_id_fk" FOREIGN KEY ("reimbursed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
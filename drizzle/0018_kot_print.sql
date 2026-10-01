-- KOT is now two features: "kot" (kitchen screen) and "kotPrint" (print KOT slips).
-- Whoever had KOT keeps both; whatever was switched off or removed stays off for both.
UPDATE "plans" SET "features" = array_append("features", 'kotPrint') WHERE 'kot' = ANY("features") AND NOT ('kotPrint' = ANY("features"));
--> statement-breakpoint
UPDATE "tenants" SET "features" = array_append("features", 'kotPrint') WHERE 'kot' = ANY("features") AND NOT ('kotPrint' = ANY("features"));
--> statement-breakpoint
UPDATE "tenants" SET "features_off" = array_append("features_off", 'kotPrint') WHERE 'kot' = ANY("features_off") AND NOT ('kotPrint' = ANY("features_off"));
--> statement-breakpoint
UPDATE "tenants" SET "features_removed" = array_append("features_removed", 'kotPrint') WHERE 'kot' = ANY("features_removed") AND NOT ('kotPrint' = ANY("features_removed"));

CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_event_id" uuid,
	"vehicle_id" text,
	"signal_path" text,
	"value" numeric,
	"unit" text,
	"recorded_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"make" text,
	"model" text,
	"year" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" text,
	"event_name" text NOT NULL,
	"event_timestamp" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now(),
	"signature_valid" boolean,
	"raw_payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_webhook_event_id_webhook_events_id_fk" FOREIGN KEY ("webhook_event_id") REFERENCES "public"."webhook_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;
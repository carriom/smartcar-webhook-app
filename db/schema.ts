import { pgTable, text, integer, timestamp, jsonb, uuid, boolean, numeric } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const vehicles = pgTable('vehicles', {
  id: text('id').primaryKey(),
  make: text('make'),
  model: text('model'),
  year: integer('year'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  vehicleId: text('vehicle_id').references(() => vehicles.id),
  eventName: text('event_name').notNull(),
  eventTimestamp: timestamp('event_timestamp', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow(),
  signatureValid: boolean('signature_valid'),
  rawPayload: jsonb('raw_payload').notNull(),
})

export const signals = pgTable('signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  webhookEventId: uuid('webhook_event_id').references(() => webhookEvents.id),
  vehicleId: text('vehicle_id'),
  signalPath: text('signal_path'),
  value: text('value'), // Flexible text field for JSON or primitive values
  unit: text('unit'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow(),
})

export const vehiclesRelations = relations(vehicles, ({ many }) => ({
  events: many(webhookEvents),
}))

export const webhookEventsRelations = relations(webhookEvents, ({ one, many }) => ({
  vehicle: one(vehicles, {
    fields: [webhookEvents.vehicleId],
    references: [vehicles.id],
  }),
  signals: many(signals),
}))

export const signalsRelations = relations(signals, ({ one }) => ({
  event: one(webhookEvents, {
    fields: [signals.webhookEventId],
    references: [webhookEvents.id],
  }),
}))



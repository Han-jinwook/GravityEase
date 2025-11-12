import { pgTable, text, serial, integer, boolean, decimal, timestamp, date, time, jsonb, varchar, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table for OAuth authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").unique(),
  name: varchar("name"),
  provider: varchar("provider"), // 'google' or 'kakao'
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

// Measurement records table (individual angle records)
export const measurementRecords = pgTable("measurement_records", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  angle: decimal("angle", { precision: 4, scale: 1 }), // e.g., -5.3
  durationSeconds: integer("duration_seconds"), // actual hold time (60+ seconds)
  sessionDate: date("session_date"),
  sessionTime: time("session_time")
});

// User settings table
export const userSettings = pgTable("user_settings", {
  userId: varchar("user_id").primaryKey().references(() => users.id),
  voiceFeedback: boolean("voice_feedback").default(true),
  notifications: boolean("notifications").default(true),
  alarmTime: time("alarm_time").default("07:00")
});

// Daily session summary table
export const dailySessions = pgTable("daily_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  sessionDate: date("session_date"),
  totalDurationSeconds: integer("total_duration_seconds").default(0),
  sessionCount: integer("session_count").default(0),
  averageAngle: decimal("average_angle", { precision: 5, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

// Sessions table for Passport.js
export const sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull()
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true
});

export const insertMeasurementRecordSchema = createInsertSchema(measurementRecords).omit({
  id: true
});

export const insertUserSettingsSchema = createInsertSchema(userSettings);

export const insertDailySessionSchema = createInsertSchema(dailySessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type MeasurementRecord = typeof measurementRecords.$inferSelect;
export type InsertMeasurementRecord = z.infer<typeof insertMeasurementRecordSchema>;
export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type DailySession = typeof dailySessions.$inferSelect;
export type InsertDailySession = z.infer<typeof insertDailySessionSchema>;

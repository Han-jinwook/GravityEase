import { 
  users, 
  measurementRecords, 
  userSettings,
  dailySessions,
  type User, 
  type InsertUser,
  type MeasurementRecord,
  type InsertMeasurementRecord,
  type UserSettings,
  type InsertUserSettings,
  type DailySession,
  type InsertDailySession
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, count, sum } from "drizzle-orm";

export interface IStorage {
  getUserById(id: string): Promise<User | undefined>;
  createUser(insertUser: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<Omit<InsertUser, 'id'>>): Promise<User>;
  createMeasurementRecord(record: InsertMeasurementRecord): Promise<MeasurementRecord>;
  getMeasurementRecordsByUserId(userId: string): Promise<MeasurementRecord[]>;
  getMeasurementRecordsByDate(userId: string, date: string): Promise<MeasurementRecord[]>;
  getMeasurementStats(userId: string): Promise<any>;
  getUserSettings(userId: string): Promise<UserSettings | undefined>;
  createUserSettings(settings: InsertUserSettings): Promise<UserSettings>;
  updateUserSettings(userId: string, settings: Partial<InsertUserSettings>): Promise<UserSettings>;
  getDailySession(userId: string, date: string): Promise<DailySession | undefined>;
  getLastDailySession(userId: string): Promise<DailySession | undefined>;
  createDailySession(session: InsertDailySession): Promise<DailySession>;
  updateDailySession(userId: string, date: string, duration: number): Promise<DailySession>;
  calculateAndUpdateAverageAngle(userId: string, date: string): Promise<DailySession>;
  getAllDailySessionsByUserId(userId: string): Promise<DailySession[]>;
  getMeasurementRecordsByUserIdAndDate(userId: string, date: string): Promise<MeasurementRecord[]>;
}

export class DatabaseStorage implements IStorage {
  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<Omit<InsertUser, 'id'>>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async createMeasurementRecord(record: InsertMeasurementRecord): Promise<MeasurementRecord> {
    const [measurement] = await db
      .insert(measurementRecords)
      .values(record)
      .returning();
    
    // Update daily session summary
    if (record.userId && record.sessionDate && record.durationSeconds) {
      await this.updateDailySession(record.userId, record.sessionDate, record.durationSeconds);
    }
    
    return measurement;
  }

  async getMeasurementRecordsByUserId(userId: string): Promise<MeasurementRecord[]> {
    return await db
      .select()
      .from(measurementRecords)
      .where(eq(measurementRecords.userId, userId))
      .orderBy(desc(measurementRecords.sessionDate));
  }

  async getMeasurementRecordsByDate(userId: string, date: string): Promise<MeasurementRecord[]> {
    return await db
      .select()
      .from(measurementRecords)
      .where(and(eq(measurementRecords.userId, userId), eq(measurementRecords.sessionDate, date)))
      .orderBy(desc(measurementRecords.sessionTime));
  }

  async getMeasurementStats(userId: string): Promise<any> {
    const today = new Date().toISOString().split('T')[0];
    
    const todayStats = await db
      .select({
        totalRecords: count(),
        totalDuration: sum(measurementRecords.durationSeconds)
      })
      .from(measurementRecords)
      .where(
        and(
          eq(measurementRecords.userId, userId),
          eq(measurementRecords.sessionDate, today)
        )
      );

    const weeklyStats = await db
      .select({
        totalRecords: count(),
        totalDuration: sum(measurementRecords.durationSeconds)
      })
      .from(measurementRecords)
      .where(
        and(
          eq(measurementRecords.userId, userId),
          gte(measurementRecords.sessionDate, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        )
      );

    return {
      today: todayStats[0] || { totalRecords: 0, totalDuration: 0 },
      weekly: weeklyStats[0] || { totalRecords: 0, totalDuration: 0 }
    };
  }

  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    return settings || undefined;
  }

  async createUserSettings(settings: InsertUserSettings): Promise<UserSettings> {
    const [userSetting] = await db
      .insert(userSettings)
      .values(settings)
      .returning();
    return userSetting;
  }

  async updateUserSettings(userId: string, settings: Partial<InsertUserSettings>): Promise<UserSettings> {
    const [userSetting] = await db
      .update(userSettings)
      .set(settings)
      .where(eq(userSettings.userId, userId))
      .returning();
    return userSetting;
  }

  async getDailySession(userId: string, date: string): Promise<DailySession | undefined> {
    const [session] = await db
      .select()
      .from(dailySessions)
      .where(and(eq(dailySessions.userId, userId), eq(dailySessions.sessionDate, date)));
    return session;
  }

  async getLastDailySession(userId: string): Promise<DailySession | undefined> {
    const [session] = await db
      .select()
      .from(dailySessions)
      .where(eq(dailySessions.userId, userId))
      .orderBy(desc(dailySessions.sessionDate))
      .limit(1);
    return session;
  }

  async createDailySession(session: InsertDailySession): Promise<DailySession> {
    const [newSession] = await db
      .insert(dailySessions)
      .values(session)
      .returning();
    return newSession;
  }

  async updateDailySession(userId: string, date: string, duration: number): Promise<DailySession> {
    // Check if session exists for today
    const existing = await this.getDailySession(userId, date);
    
    if (existing) {
      // Update existing session
      const [updated] = await db
        .update(dailySessions)
        .set({
          totalDurationSeconds: (existing.totalDurationSeconds || 0) + duration,
          sessionCount: (existing.sessionCount || 0) + 1,
          updatedAt: new Date()
        })
        .where(and(eq(dailySessions.userId, userId), eq(dailySessions.sessionDate, date)))
        .returning();
      return updated;
    } else {
      // Create new session
      return await this.createDailySession({
        userId,
        sessionDate: date,
        totalDurationSeconds: duration,
        sessionCount: 1
      });
    }
  }

  async calculateAndUpdateAverageAngle(userId: string, date: string): Promise<DailySession> {
    // Get all measurement records for the date
    const measurements = await this.getMeasurementRecordsByDate(userId, date);
    
    if (measurements.length === 0) {
      // No measurements, return existing session or create one with 0 average
      const existing = await this.getDailySession(userId, date);
      if (existing) return existing;
      
      return await this.createDailySession({
        userId,
        sessionDate: date,
        totalDurationSeconds: 0,
        sessionCount: 0,
        averageAngle: "0"
      });
    }

    // Helper function to calculate weighted average
    const calcAvgAngle = (sessions: { angle: number; duration: number }[]) => {
      const totalWeightedAngle = sessions.reduce((sum, session) => {
        return sum + (session.angle * session.duration);
      }, 0);
      
      const totalSeconds = sessions.reduce((sum, session) => 
        sum + session.duration, 0);
      
      return totalSeconds > 0 ? (totalWeightedAngle / totalSeconds) : 0;
    };

    // Convert measurements to sessions format
    const sessions = measurements.map(m => ({
      angle: parseFloat(m.angle || "0"),
      duration: m.durationSeconds || 0
    }));

    const averageAngle = calcAvgAngle(sessions);
    
    // Update or create daily session with calculated average
    const existing = await this.getDailySession(userId, date);
    
    if (existing) {
      const [updated] = await db
        .update(dailySessions)
        .set({
          averageAngle: averageAngle.toFixed(1),
          updatedAt: new Date()
        })
        .where(and(eq(dailySessions.userId, userId), eq(dailySessions.sessionDate, date)))
        .returning();
      return updated;
    } else {
      return await this.createDailySession({
        userId,
        sessionDate: date,
        totalDurationSeconds: sessions.reduce((sum, s) => sum + s.duration, 0),
        sessionCount: sessions.length,
        averageAngle: averageAngle.toFixed(1)
      });
    }
  }

  async getAllDailySessionsByUserId(userId: string): Promise<DailySession[]> {
    const sessions = await db
      .select()
      .from(dailySessions)
      .where(eq(dailySessions.userId, userId))
      .orderBy(desc(dailySessions.sessionDate));
    return sessions;
  }

  async getMeasurementRecordsByUserIdAndDate(userId: string, date: string): Promise<MeasurementRecord[]> {
    const records = await db
      .select()
      .from(measurementRecords)
      .where(and(eq(measurementRecords.userId, userId), eq(measurementRecords.sessionDate, date)))
      .orderBy(desc(measurementRecords.sessionTime));
    return records;
  }
}

export const storage = new DatabaseStorage();
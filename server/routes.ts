import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMeasurementRecordSchema, insertUserSettingsSchema, type DailySession, type MeasurementRecord } from "@shared/schema";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as KakaoStrategy } from "passport-kakao";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import { pool } from "./db";

const PgSession = ConnectPgSimple(session);

export async function registerRoutes(app: Express): Promise<Server> {
  // Session configuration
  app.use(session({
    store: new PgSession({
      pool: pool,
      tableName: 'sessions'
    }),
    secret: process.env.SESSION_SECRET || 'your_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
  }));

  // Passport configuration
  app.use(passport.initialize());
  app.use(passport.session());

  // Google OAuth Strategy (only if credentials are provided)
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: 'https://gravity-ease-chiuking369.replit.app/api/auth/google/callback'
    }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        console.log('Google OAuth profile received:', profile.id);
        
        let user = await storage.getUserById(profile.id);
        
        if (!user) {
          user = await storage.createUser({
            id: profile.id,
            email: profile.emails?.[0]?.value || '',
            name: profile.displayName || '',
            provider: 'google',
            profileImageUrl: profile.photos?.[0]?.value || ''
          });
          
          // Create default user settings
          await storage.createUserSettings({
            userId: user.id,
            voiceFeedback: true,
            notifications: true,
            alarmTime: "07:00"
          });
        } else {
          // Update existing user with latest profile info
          user = await storage.updateUser(profile.id, {
            name: profile.displayName || user.name,
            profileImageUrl: profile.photos?.[0]?.value || user.profileImageUrl
          });
        }
        

        return done(null, user);
      } catch (error) {
        console.error('Google OAuth error:', error);
        return done(error, false);
      }
    }));
  }

  // Kakao OAuth Strategy (only if credentials are provided)
  if (process.env.KAKAO_CLIENT_ID && process.env.KAKAO_CLIENT_SECRET) {
    passport.use(new KakaoStrategy({
      clientID: process.env.KAKAO_CLIENT_ID,
      clientSecret: process.env.KAKAO_CLIENT_SECRET,
      callbackURL: 'https://gravity-ease-chiuking369.replit.app/api/auth/kakao/callback'
    }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        let user = await storage.getUserById(profile.id);
        
        if (!user) {
          user = await storage.createUser({
            id: profile.id,
            email: profile._json?.kakao_account?.email || '',
            name: profile.displayName || '',
            provider: 'kakao',
            profileImageUrl: profile._json?.properties?.profile_image || ''
          });
          
          await storage.createUserSettings({
            userId: user.id,
            voiceFeedback: true,
            notifications: true,
            alarmTime: "07:00"
          });
        } else {
          user = await storage.updateUser(profile.id, {
            name: profile.displayName || user.name,
            profileImageUrl: profile._json?.properties?.profile_image || user.profileImageUrl
          });
        }
        
        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    }));
  }

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUserById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  // Auth middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: 'Authentication required' });
  };

  // Auth routes
  app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  
  app.get('/api/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
      res.redirect('/');
    }
  );

  app.get('/api/auth/kakao', passport.authenticate('kakao'));
  app.get('/api/auth/kakao/callback',
    passport.authenticate('kakao', { failureRedirect: '/' }),
    (req, res) => {
      res.redirect('/');
    }
  );

  app.post('/api/auth/logout', (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: 'Logout failed' });
      }
      res.json({ message: 'Logged out successfully' });
    });
  });



  app.get('/api/auth/user', (req, res) => {
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).json({ message: 'Not authenticated' });
    }
  });

  // Measurement records API
  app.post('/api/measurements', requireAuth, async (req, res) => {
    try {
      const validation = insertMeasurementRecordSchema.safeParse({
        ...req.body,
        userId: (req.user as any).id
      });
      
      if (!validation.success) {
        return res.status(400).json({ message: 'Invalid data', errors: validation.error.errors });
      }

      const record = await storage.createMeasurementRecord(validation.data);
      res.json(record);
    } catch (error) {
      console.error('Error creating measurement record:', error);
      res.status(500).json({ message: 'Failed to save measurement record' });
    }
  });

  app.get('/api/measurements', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const records = await storage.getMeasurementRecordsByUserId(userId);
      // Format dates as simple YYYY-MM-DD strings
      const formattedRecords = records.map(record => ({
        ...record,
        sessionDate: record.sessionDate ? new Date(record.sessionDate).toISOString().split('T')[0] : null
      }));
      res.json(formattedRecords);
    } catch (error) {
      console.error('Error fetching measurement records:', error);
      res.status(500).json({ message: 'Failed to fetch measurement records' });
    }
  });

  app.get('/api/measurements/today', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const today = new Date().toISOString().split('T')[0];
      const records = await storage.getMeasurementRecordsByDate(userId, today);
      // Format dates as simple YYYY-MM-DD strings
      const formattedRecords = records.map((record: any) => ({
        ...record,
        sessionDate: record.sessionDate ? new Date(record.sessionDate).toISOString().split('T')[0] : null
      }));
      res.json(formattedRecords);
    } catch (error) {
      console.error('Error fetching today measurement records:', error);
      res.status(500).json({ message: 'Failed to fetch today measurement records' });
    }
  });

  app.get('/api/measurements/stats', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const stats = await storage.getMeasurementStats(userId);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching measurement stats:', error);
      res.status(500).json({ message: 'Failed to fetch measurement stats' });
    }
  });

  // User settings API
  app.get('/api/settings', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const settings = await storage.getUserSettings(userId);
      res.json(settings);
    } catch (error) {
      console.error('Error fetching user settings:', error);
      res.status(500).json({ message: 'Failed to fetch user settings' });
    }
  });

  app.put('/api/settings', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const validation = insertUserSettingsSchema.safeParse({
        ...req.body,
        userId
      });
      
      if (!validation.success) {
        return res.status(400).json({ message: 'Invalid data', errors: validation.error.errors });
      }

      const settings = await storage.updateUserSettings(userId, validation.data);
      res.json(settings);
    } catch (error) {
      console.error('Error updating user settings:', error);
      res.status(500).json({ message: 'Failed to update user settings' });
    }
  });

  // Daily sessions API
  app.get('/api/daily-sessions/today', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const today = new Date().toISOString().split('T')[0];
      const session = await storage.getDailySession(userId, today);
      
      if (session) {
        // Format dates as simple YYYY-MM-DD strings
        const formattedSession = {
          ...session,
          sessionDate: session.sessionDate ? new Date(session.sessionDate).toISOString().split('T')[0] : null,
          createdAt: session.createdAt ? new Date(session.createdAt).toISOString().split('T')[0] : null,
          updatedAt: session.updatedAt ? new Date(session.updatedAt).toISOString().split('T')[0] : null
        };
        res.json(formattedSession);
      } else {
        res.json({ totalDurationSeconds: 0, sessionCount: 0 });
      }
    } catch (error) {
      console.error('Error fetching daily session:', error);
      res.status(500).json({ message: 'Failed to fetch daily session' });
    }
  });

  app.get('/api/daily-sessions/last', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const session = await storage.getLastDailySession(userId);
      
      if (session) {
        // Format dates as simple YYYY-MM-DD strings
        const formattedSession = {
          ...session,
          sessionDate: session.sessionDate ? new Date(session.sessionDate).toISOString().split('T')[0] : null,
          createdAt: session.createdAt ? new Date(session.createdAt).toISOString().split('T')[0] : null,
          updatedAt: session.updatedAt ? new Date(session.updatedAt).toISOString().split('T')[0] : null
        };
        res.json(formattedSession);
      } else {
        res.json(null);
      }
    } catch (error) {
      console.error('Error fetching last daily session:', error);
      res.status(500).json({ message: 'Failed to fetch last daily session' });
    }
  });

  // Update average angle for daily session
  app.post('/api/daily-sessions/update-average', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { date, averageAngle } = req.body;
      
      if (!date || averageAngle === undefined) {
        return res.status(400).json({ message: 'Date and averageAngle are required' });
      }

      // Get or create daily session
      let session = await storage.getDailySession(userId, date);
      if (!session) {
        session = await storage.createDailySession({
          userId,
          sessionDate: date,
          totalDurationSeconds: 0,
          sessionCount: 0,
          averageAngle: averageAngle
        });
      } else {
        // Update existing session with new average angle
        await storage.calculateAndUpdateAverageAngle(userId, date);
      }

      res.json({ success: true, averageAngle });
    } catch (error) {
      console.error('Error updating average angle:', error);
      res.status(500).json({ message: 'Failed to update average angle' });
    }
  });

  // Records history API for records page
  app.get('/api/records/history', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const dailySessions = await storage.getAllDailySessionsByUserId(userId);
      
      // Format dates and sort by date descending
      const formattedSessions = dailySessions
        .map((session: any) => ({
          ...session,
          sessionDate: session.sessionDate ? new Date(session.sessionDate).toISOString().split('T')[0] : null,
          createdAt: session.createdAt ? new Date(session.createdAt).toISOString().split('T')[0] : null,
          updatedAt: session.updatedAt ? new Date(session.updatedAt).toISOString().split('T')[0] : null
        }))
        .sort((a: any, b: any) => new Date(b.sessionDate || 0).getTime() - new Date(a.sessionDate || 0).getTime());
      
      res.json(formattedSessions);
    } catch (error) {
      console.error('Error fetching records history:', error);
      res.status(500).json({ message: 'Failed to fetch records history' });
    }
  });

  // Get detailed measurement records for a specific date
  app.get('/api/records/details/:date', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { date } = req.params;
      
      const records = await storage.getMeasurementRecordsByUserIdAndDate(userId, date);
      
      // Format the records
      const formattedRecords = records.map((record: any) => ({
        ...record,
        sessionDate: record.sessionDate ? new Date(record.sessionDate).toISOString().split('T')[0] : null,
        sessionTime: record.sessionTime || null
      }));
      
      res.json(formattedRecords);
    } catch (error) {
      console.error('Error fetching measurement records:', error);
      res.status(500).json({ message: 'Failed to fetch measurement records' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

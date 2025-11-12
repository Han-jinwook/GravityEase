import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Force HTTPS only for OAuth routes (Replit automatically provides HTTPS)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/auth/') && req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(`https://${req.header('host')}${req.url}`);
  }
  next();
});

// Trust proxy for correct protocol detection
app.set('trust proxy', 1);

// Intercept PWA files FIRST, before any other middleware
app.use((req, res, next) => {
  if (req.path === '/app.js' || req.path === '/sw.js') {
    res.setHeader('Content-Type', 'application/javascript');
    const filePath = path.resolve(__dirname, '../public', req.path.substring(1));
    return res.sendFile(filePath);
  }
  if (req.path === '/manifest.json') {
    res.setHeader('Content-Type', 'application/json');
    const filePath = path.resolve(__dirname, '../public/manifest.json');
    return res.sendFile(filePath);
  }
  if (req.path === '/records.html') {
    res.setHeader('Content-Type', 'text/html');
    const filePath = path.resolve(__dirname, '../public/records.html');
    return res.sendFile(filePath);
  }
  if (req.path.endsWith('.png') || req.path.endsWith('.ico')) {
    res.setHeader('Content-Type', 'image/png');
    const filePath = path.resolve(__dirname, '../public', req.path.substring(1));
    return res.sendFile(filePath);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

async function startServer() {
  try {
    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Use PORT environment variable for production deployment
    const port = process.env.PORT ? parseInt(process.env.PORT) : 5000;
    const host = "0.0.0.0";
    
    await new Promise<void>((resolve, reject) => {
      server.listen(port, host, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          log(`serving on port ${port} (host: ${host})`);
          resolve();
        }
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    console.error('Stack trace:', error);
    if (process.env.NODE_ENV === 'production') {
      console.error('Environment variables:', {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'not set'
      });
    }
    process.exit(1);
  }
}

startServer();

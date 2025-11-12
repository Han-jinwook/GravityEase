# Gravity Ease - Progressive Web App for Tilt Therapy

## Overview

Gravity Ease is a Progressive Web App (PWA) designed for tilt therapy measurement using smartphone gyroscope sensors. The application measures precise angles between -3° to -15° (reverse tilt) and provides real-time feedback with Korean voice guidance. Users can track their therapy sessions, view historical records, and authenticate through Google or Kakao OAuth. The app is optimized for mobile devices and works offline through service worker caching.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Pure HTML/CSS/JavaScript PWA**: The main application uses vanilla web technologies without a React framework for optimal mobile performance
- **Mobile-First Design**: Responsive design optimized for portrait orientation on smartphones
- **Service Worker**: Implements offline functionality, background sync, and push notifications
- **Web APIs Integration**: DeviceOrientationEvent API for gyroscope access, Web Speech API for Korean voice feedback
- **Progressive Enhancement**: Works without JavaScript but provides enhanced features when available

### Backend Architecture
- **Express.js Server**: RESTful API server handling authentication, data persistence, and session management
- **Session-Based Authentication**: Uses express-session with PostgreSQL storage for persistent user sessions
- **OAuth Integration**: Supports Google OAuth 2.0 and Kakao OAuth 2.0 for user authentication
- **RESTful API Design**: Clean API endpoints for measurement records, user settings, and daily session summaries

### Data Storage Solutions
- **PostgreSQL Database**: Primary data store using Neon serverless PostgreSQL
- **Drizzle ORM**: Type-safe database operations with schema management
- **Database Schema**:
  - Users table for OAuth user profiles
  - Measurement records for individual angle measurements (60+ second holds)
  - Daily sessions for aggregated therapy summaries
  - User settings for voice feedback and notification preferences
  - Sessions table for Passport.js session management

### Authentication and Authorization
- **Passport.js Strategy**: Handles OAuth authentication flows
- **Google OAuth 2.0**: Primary authentication method
- **Kakao OAuth 2.0**: Alternative authentication for Korean users
- **Session Management**: PostgreSQL-backed sessions with configurable expiration
- **Guest Access**: Allows measurement without authentication (no data persistence)

### Key Features and Logic
- **Multi-Angle Tracking**: Simultaneous measurement of different angles with individual timers
- **Precise Measurement**: 0.1-degree precision with 60-second minimum hold requirement
- **Voice Feedback System**: Korean language audio prompts for measurement guidance
- **PWA Capabilities**: Installable app with offline functionality and push notifications
- **Data Analytics**: Daily session summaries with average angles and total duration

## External Dependencies

### Third-Party Services
- **Neon Database**: Serverless PostgreSQL hosting for production data storage
- **Google Cloud Console**: OAuth 2.0 credentials for Google authentication
- **Kakao Developers**: OAuth 2.0 credentials for Kakao authentication

### Key Libraries and Frameworks
- **Express.js**: Web application framework for Node.js
- **Drizzle ORM**: Type-safe database toolkit for PostgreSQL
- **Passport.js**: Authentication middleware with OAuth strategies
- **React Query**: Data fetching and caching (for admin interface)
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI**: Accessible component primitives
- **TypeScript**: Type safety across the entire application

### Development Tools
- **Vite**: Build tool and development server
- **ESBuild**: Fast JavaScript bundler for production builds
- **Replit Integration**: Development environment with automatic HTTPS and deployment
# Expense Tracker Deployment Guide

## Overview
This guide explains how to deploy your Expense Tracker application to Vercel and whether you need to run a local server.

## Deployment Architecture

### Option 1: Frontend Only on Vercel (Recommended for Demo)
- **Frontend**: Deployed on Vercel
- **Backend**: Run locally or on a cloud server
- **Database**: PostgreSQL on cloud (Supabase, Railway, etc.)

### Option 2: Full Stack on Vercel
- **Frontend**: Deployed on Vercel
- **Backend**: Deployed as Vercel Serverless Functions
- **Database**: External PostgreSQL service

## Option 1: Frontend Only Deployment (Easiest)

### 1. Deploy Frontend to Vercel

**Prerequisites:**
- Vercel account
- GitHub repository with your code

**Steps:**
1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Connect your GitHub repository
4. Configure build settings:
   ```
   Framework Preset: Vite
   Root Directory: frontend
   Build Command: npm run build
   Output Directory: dist
   Install Command: cd frontend && npm install
   ```

### 2. Backend Configuration

**For Local Development:**
```bash
# Start backend locally
cd backend && npm run dev
```

**Environment Variables in Vercel:**
Add these environment variables in Vercel dashboard:
```
VITE_API_BASE_URL=https://localhost:3001
VITE_DB_ENCRYPTION_KEY=your-encryption-key
VITE_FEATURE_CLOUD_SYNC=true
```

### 3. Database Setup

**Option A: Supabase (Recommended)**
1. Create account at [supabase.com](https://supabase.com)
2. Create new project
3. Set up database schema
4. Get connection string

**Option B: Railway**
1. Create account at [railway.app](https://railway.app)
2. Deploy PostgreSQL
3. Get connection URL

**Environment Variables:**
```
DATABASE_URL=your-postgres-connection-string
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-key
```

## Option 2: Full Stack on Vercel

### 1. Backend API Routes

Create `api` directory in frontend:
```
frontend/
 api/
    auth/
       register.ts
       login.ts
    health.ts
```

**Example API Route (`frontend/api/health.ts`):**
```typescript
export default function handler(req, res) {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  });
}
```

### 2. Database Connection

**Using Prisma with Vercel:**
```typescript
// frontend/lib/db.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;
```

### 3. Environment Variables

Add to Vercel environment:
```
DATABASE_URL=your-postgres-url
JWT_SECRET=your-jwt-secret
NODE_ENV=production
```

## Do You Need a Local Server?

### **Answer: It Depends**

#### **No Local Server Needed If:**
- You deploy backend as Vercel Serverless Functions
- You use cloud database services
- You configure all environment variables in Vercel

#### **Local Server Required If:**
- You want to test locally before deployment
- You're using local development database
- You need to debug backend issues

## Recommended Setup

### **For Production:**
1. Deploy frontend to Vercel
2. Deploy backend to cloud platform (Railway, Render, etc.)
3. Use cloud database (Supabase, Railway PostgreSQL)
4. Configure environment variables in both platforms

### **For Development:**
1. Run backend locally (`npm run dev`)
2. Run frontend locally (`npm run dev`)
3. Use local or cloud database
4. Test locally before deploying

## Step-by-Step: Full Production Setup

### 1. Database Setup (Supabase)
```bash
# 1. Create Supabase project
# 2. Run migrations
npx prisma migrate deploy

# 3. Get connection string
# Format: postgresql://username:password@host:5432/database
```

### 2. Backend Deployment (Railway)
```bash
# 1. Push to GitHub
git push origin main

# 2. Connect to Railway
# 3. Set environment variables
DATABASE_URL=your-supabase-url
JWT_SECRET=your-secret-key
PORT=3000

# 3. Deploy
```

### 3. Frontend Deployment (Vercel)
```bash
# 1. Connect GitHub repo
# 2. Set build settings
ROOT_DIRECTORY=frontend
BUILD_COMMAND=npm run build
OUTPUT_DIRECTORY=dist

# 3. Set environment variables
VITE_API_BASE_URL=https://your-backend-url.com
VITE_DB_ENCRYPTION_KEY=your-key
```

## Environment Variables Reference

### Backend (.env)
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=your-postgres-url
JWT_SECRET=your-jwt-secret
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-key
```

### Frontend (Vercel Environment)
```env
VITE_API_BASE_URL=https://your-backend-api.com
VITE_DB_ENCRYPTION_KEY=your-encryption-key
VITE_FEATURE_CLOUD_SYNC=true
```

## Testing Your Deployment

### 1. Health Check
```bash
curl https://your-frontend.vercel.app/api/health
```

### 2. API Test
```bash
curl -X POST https://your-backend.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User","password":"password123"}'
```

## Troubleshooting

### Common Issues:
1. **CORS Errors**: Configure CORS in backend
2. **Database Connection**: Check connection strings
3. **Environment Variables**: Verify all variables are set
4. **Build Errors**: Check build logs in Vercel

### Debugging:
1. Check Vercel deployment logs
2. Test API endpoints directly
3. Verify database connections
4. Check environment variable values

## Cost Considerations

### Free Tiers:
- **Vercel**: Free for frontend
- **Supabase**: Free tier available
- **Railway**: Free credits monthly
- **Render**: Free tier with limitations

### Production Costs:
- **Database**: $5-25/month
- **Backend Hosting**: $5-15/month
- **Frontend**: Usually free on Vercel

## Conclusion

**You do NOT need to run a local server for your deployed application to work online.** Once deployed to Vercel with proper backend hosting and database setup, your application will run completely in the cloud.

However, you'll still want a local server for:
- Development and testing
- Debugging issues
- Making changes and updates

The deployment setup allows your users to access the application online without requiring them to run any local servers.
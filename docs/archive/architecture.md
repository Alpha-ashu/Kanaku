# Expense Tracker Architecture

## Overview

The Expense Tracker is a modern full-stack application built with TypeScript, React, and Prisma.

## Tech Stack

### Frontend
- **Framework**: React 18 with Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Routing**: React Router
- **Icons**: Lucide React
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT with bcrypt
- **Real-time**: Socket.IO
- **Testing**: Jest with Supertest

### Infrastructure
- **Deployment**: Vercel (Frontend)
- **Containerization**: Docker
- **Database**: PostgreSQL
- **Environment**: Environment-driven configuration

## Project Structure

```
expense-tracker/
 backend/           # Node.js API server
    src/
       modules/   # Feature modules (auth, users, todos)
       middleware/ # Express middleware
       utils/     # Shared utilities
       config/    # Configuration
    prisma/        # Database schema
 frontend/          # React application
    src/
       app/       # Application logic
       components/ # Reusable components
       lib/       # Utilities
 docs/              # Documentation
```

## API Design

### Versioning
- API endpoints are versioned at `/api/v1`
- Backward compatibility maintained through versioning

### Authentication
- JWT-based authentication
- Refresh token mechanism
- Password hashing with bcrypt

### Error Handling
- Centralized error handling middleware
- Consistent error response format
- Environment-aware error details

## Database Schema

### Core Entities
- **Users**: User accounts and authentication
- **RefreshTokens**: Token management for security
- **Todos**: Task management (example entity)

### Relationships
- Users have many RefreshTokens (one-to-many)
- Users have many Todos (one-to-many)
- Cascade deletes for data integrity

## Development Workflow

1. **Setup**: Install dependencies with `npm install`
2. **Database**: Run migrations with `prisma migrate dev`
3. **Development**: Start with `npm run dev`
4. **Testing**: Run tests with `npm test`
5. **Build**: Compile with `npm run build`

## Deployment

### Frontend
- Deployed to Vercel
- Environment variables configured in Vercel dashboard
- Automatic deployments from main branch

### Backend
- Containerized with Docker
- Environment-driven configuration
- Database migrations in deployment pipeline
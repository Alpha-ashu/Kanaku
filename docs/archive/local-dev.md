# Local Development Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Docker (optional, for database)

## Setup

### 1. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Database Setup

#### Option A: Local PostgreSQL
```bash
# Install PostgreSQL locally
# Create database: expense_tracker
# Update DATABASE_URL in .env
```

#### Option B: Docker
```bash
# Start PostgreSQL with docker-compose
cd backend
docker-compose up -d db
```

### 3. Environment Configuration

Copy environment files:
```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```

Update environment variables:
```bash
# Backend .env
DATABASE_URL="postgresql://postgres:password@localhost:5432/expense_tracker"
JWT_SECRET="your-super-secret-jwt-key-min-32-characters-long"

# Frontend .env
VITE_API_BASE_URL="http://localhost:3000"
VITE_SOCKET_URL="http://localhost:3000"
```

### 4. Database Migrations

```bash
cd backend
npx prisma migrate dev
```

### 5. Start Development Servers

```bash
# Backend
cd backend
npm run dev

# Frontend (new terminal)
cd frontend
npm run dev
```

## Development Commands

### Backend
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run test         # Run tests
npm run lint         # Check linting
npm run lint:fix     # Fix linting issues
npm run db:migrate   # Run migrations
npm run db:studio    # Open Prisma Studio
```

### Frontend
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
```

## Testing

### Backend Tests
```bash
cd backend
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode
```

### Frontend Tests
```bash
cd frontend
npm test             # Run tests (if configured)
```

## Database Management

### Prisma Studio
```bash
cd backend
npx prisma studio
```

### Manual SQL
```bash
# Connect to database
psql postgresql://postgres:password@localhost:5432/expense_tracker

# Or with Docker
docker exec -it expense-tracker-db psql -U postgres -d expense_tracker
```

## Debugging

### Backend
- Logs are written to `logs/` directory
- Set `LOG_LEVEL=debug` for verbose logging
- Use `NODE_ENV=development` for stack traces

### Frontend
- Open browser dev tools
- Check console for errors
- Use React DevTools extension

## Common Issues

### Port Already in Use
```bash
# Find process using port 3000
lsof -ti:3000

# Kill process
kill -9 <PID>
```

### Database Connection
```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# Restart PostgreSQL
sudo service postgresql restart
```

### Prisma Issues
```bash
# Regenerate client
npx prisma generate

# Reset database (development only)
npx prisma migrate reset
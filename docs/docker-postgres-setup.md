# PostgreSQL Docker Setup for Expense Tracker

## Overview
This guide sets up PostgreSQL using Docker for your Expense Tracker application, allowing you to run a local database that can be accessed by your application.

## Prerequisites
- Docker Desktop installed and running
- Docker Compose (included with Docker Desktop)

## Setup Instructions

### 1. Create Docker Compose File

Create a `docker-compose.yml` file in your project root:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    container_name: expense_tracker_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: expense_tracker
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - expense_tracker_network

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: expense_tracker_pgadmin
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@example.com
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "8080:80"
    depends_on:
      - postgres
    networks:
      - expense_tracker_network

volumes:
  postgres_data:

networks:
  expense_tracker_network:
    driver: bridge
```

### 2. Create Database Initialization Script

Create an `init.sql` file in your project root:

```sql
-- Create the expense_tracker database if it doesn't exist
CREATE DATABASE expense_tracker;

-- Connect to the expense_tracker database
\c expense_tracker;

-- Create tables based on your Prisma schema
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR UNIQUE NOT NULL,
    name VARCHAR NOT NULL,
    password VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR UNIQUE NOT NULL,
    user_id VARCHAR NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS todos (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    user_id VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
```

### 3. Update Environment Variables

Update your `backend/.env` file:

```env
# Environment
NODE_ENV=development
PORT=3000

# Database - Docker PostgreSQL
DATABASE_URL="postgresql://postgres:password@localhost:5432/expense_tracker"

# Authentication
JWT_SECRET="your-super-secret-jwt-key-min-32-characters-long"

# Frontend
FRONTEND_URL="http://localhost:5173"

# Logging
LOG_LEVEL=info

# Supabase
SUPABASE_URL="https://mmwrckfqeqjfqciymemh.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="sb_secret_rLtUWQRvgcjFaM5mzR4c0w_bQd6Oywx"

# API Keys and Credentials
# Add your API keys here when needed
# STRIPE_API_KEY="your_stripe_api_key"
# OPENAI_API_KEY="your_openai_api_key"
# GOOGLE_API_KEY="your_google_api_key"
# FIREBASE_SECRET="your_firebase_secret"
# AWS_SECRET_ACCESS_KEY="your_aws_secret"
# SENDGRID_API_KEY="your_sendgrid_api_key"
```

### 4. Start PostgreSQL with Docker

Run the following commands in your project root:

```bash
# Start PostgreSQL and pgAdmin
docker-compose up -d

# Check if containers are running
docker-compose ps

# View logs
docker-compose logs postgres
```

### 5. Access pgAdmin (Optional)

Open your browser and go to:
- URL: http://localhost:8080
- Email: admin@example.com
- Password: admin

Add your PostgreSQL server:
- Host: localhost
- Port: 5432
- Username: postgres
- Password: password
- Database: expense_tracker

### 6. Run Database Migrations

```bash
cd backend
npx prisma migrate dev --name init
```

### 7. Start Your Application

```bash
# Start backend
cd backend && npm run dev

# Start frontend
cd frontend && npm run dev
```

## Docker Commands

### Basic Operations
```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Stop and remove containers, networks, and volumes
docker-compose down -v

# View logs
docker-compose logs

# View logs for specific service
docker-compose logs postgres
docker-compose logs pgadmin

# Restart services
docker-compose restart

# Check container status
docker-compose ps
```

### Database Management
```bash
# Access PostgreSQL shell
docker exec -it expense_tracker_postgres psql -U postgres -d expense_tracker

# Backup database
docker exec expense_tracker_postgres pg_dump -U postgres expense_tracker > backup.sql

# Restore database
docker exec -i expense_tracker_postgres psql -U postgres -d expense_tracker < backup.sql
```

## Troubleshooting

### Port Already in Use
If port 5432 is already in use by your local PostgreSQL:
```bash
# Stop local PostgreSQL service
# On Windows: net stop postgresql-x64-18
# On macOS/Linux: sudo systemctl stop postgresql

# Or change the port mapping in docker-compose.yml
ports:
  - "5433:5432"  # Map to different host port
```

### Database Connection Issues
```bash
# Check if PostgreSQL is accepting connections
docker exec expense_tracker_postgres pg_isready -U postgres

# Check database exists
docker exec expense_tracker_postgres psql -U postgres -c "SELECT datname FROM pg_database;"
```

### Reset Database
```bash
# Stop and remove containers
docker-compose down -v

# Remove volumes
docker volume rm expense_tracker_postgres_postgres_data

# Start fresh
docker-compose up -d
```

## Production Considerations

### Security
- Change default passwords
- Use environment variables for sensitive data
- Enable SSL/TLS connections
- Use strong database passwords

### Performance
- Adjust PostgreSQL configuration
- Set up proper indexing
- Monitor database performance
- Consider connection pooling

### Backup Strategy
- Set up automated backups
- Use volume backups
- Test restore procedures
- Consider cloud storage for backups

## Integration with Your Application

Your application should now be able to connect to PostgreSQL via:
- **Host**: localhost
- **Port**: 5432
- **Database**: expense_tracker
- **Username**: postgres
- **Password**: password

The connection string in your `.env` file:
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/expense_tracker"
```

This setup provides a complete PostgreSQL database environment for your Expense Tracker application using Docker, with optional pgAdmin for database management.
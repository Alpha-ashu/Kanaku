# Deployment Guide

## Overview

This guide covers deploying the Expense Tracker application to production environments.

## Prerequisites

- Docker installed (for containerized deployment)
- PostgreSQL database instance
- Domain name (optional)
- SSL certificate (optional, recommended)

## Environment Setup

### Production Environment Variables

Create `.env.production` files for both backend and frontend:

**Backend `.env.production`:**
```bash
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://user:password@host:5432/dbname"
JWT_SECRET="your-production-jwt-secret-32+chars"
LOG_LEVEL=info
```

**Frontend `.env.production`:**
```bash
VITE_API_BASE_URL="https://your-api-domain.com"
VITE_SOCKET_URL="https://your-api-domain.com"
```

## Deployment Options

### Option 1: Docker Compose (Recommended)

1. **Build and Deploy**
```bash
cd backend
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

2. **Production Docker Compose**
Create `docker-compose.prod.yml`:
```yaml
version: '3.8'

services:
  api:
    build: .
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      JWT_SECRET: ${JWT_SECRET}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Option 2: Manual Deployment

1. **Backend Server**
```bash
# Install dependencies
npm install --production

# Run migrations
npx prisma migrate deploy

# Start application
npm start
```

2. **Frontend (Vercel)**
```bash
# Build frontend
cd frontend
npm run build

# Deploy to Vercel
vercel --prod
```

### Option 3: Cloud Platforms

#### AWS ECS/Fargate
- Use the provided Dockerfile
- Configure ECS task with environment variables
- Set up Application Load Balancer

#### Google Cloud Run
- Deploy container directly
- Configure environment variables in Cloud Run settings
- Enable HTTPS

#### Azure Container Instances
- Use Docker image
- Configure environment variables
- Set up networking

## Database Migration

### Production Migration
```bash
# Run migrations in production
cd backend
npx prisma migrate deploy

# Generate client
npx prisma generate
```

### Database Backup
```bash
# Create backup
pg_dump -h host -U user -d dbname > backup.sql

# Restore backup
psql -h host -U user -d dbname < backup.sql
```

## Monitoring and Logging

### Application Monitoring
- Set up health checks at `/health`
- Monitor response times and error rates
- Use APM tools (DataDog, New Relic)

### Log Management
- Configure log rotation
- Use centralized logging (ELK stack, CloudWatch)
- Set appropriate log levels

### Performance Monitoring
- Monitor database connection pools
- Track API response times
- Set up alerts for high error rates

## Security Considerations

### Environment Variables
- Never commit secrets to version control
- Use environment-specific configuration
- Rotate secrets regularly

### Database Security
- Use strong passwords
- Enable SSL connections
- Restrict database access by IP

### API Security
- Use HTTPS in production
- Implement rate limiting
- Validate all inputs
- Use secure JWT secrets

### Container Security
- Keep base images updated
- Scan for vulnerabilities
- Use minimal base images

## SSL/TLS Configuration

### Let's Encrypt (Recommended)
```bash
# Using certbot
certbot --nginx -d your-domain.com

# Auto-renewal
echo "0 12 * * * /usr/bin/certbot renew --quiet" | crontab -
```

### Cloud Provider SSL
- AWS Certificate Manager
- Google Cloud SSL Certificates
- Azure App Service Certificates

## CI/CD Pipeline

### GitHub Actions Example
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to production
        run: |
          # Deploy backend
          # Deploy frontend
          # Run migrations
```

### Deployment Checklist
- [ ] Environment variables configured
- [ ] Database migrated
- [ ] SSL certificates installed
- [ ] Health checks passing
- [ ] Monitoring configured
- [ ] Backup strategy in place
- [ ] Security headers configured
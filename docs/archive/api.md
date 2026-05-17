# API Documentation

## Base URL
```
http://localhost:3000/api/v1
```

## Authentication

All authenticated endpoints require a valid JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## Endpoints

### Health Check
```
GET /health
```
Returns server status and timestamp.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Authentication

#### Register
```
POST /auth/register
```
Register a new user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "password": "password123"
}
```

**Response:**
```json
{
  "user": {
    "id": "clxyz123",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### Login
```
POST /auth/login
```
Authenticate user and receive tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

## Error Responses

All error responses follow this format:
```json
{
  "error": {
    "message": "Error description",
    "stack": "Stack trace (development only)"
  }
}
```

## Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error

## Rate Limiting

API endpoints are rate-limited to prevent abuse. Exceeding limits will return a `429 Too Many Requests` status code.

## CORS

CORS is enabled for development. Configure `FRONTEND_URL` environment variable for production.
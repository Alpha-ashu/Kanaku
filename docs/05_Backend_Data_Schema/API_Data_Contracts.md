# API Data Contracts — Kanaku

> Typed DTOs + zod-aligned shapes. Amounts in minor units (integer).

## User DTO
```json
{
  "userId": "uuid",
  "name": "Ashraf",
  "email": "user@mail.com"
}
```

## Account DTO
```json
{
  "id": "uuid",
  "name": "Bank",
  "currency": "INR",
  "balance": 50230
}
```

## Transaction DTO (response)
```json
{
  "id": "uuid",
  "accountId": "uuid",
  "type": "expense",
  "amount": 1299,
  "category": "food",
  "occurredAt": "2026-06-19T10:00:00Z",
  "note": "Lunch"
}
```

## Create Transaction (request)
```json
{
  "accountId": "uuid",
  "type": "expense",
  "amount": 1299,
  "category": "food",
  "occurredAt": "2026-06-19T10:00:00Z",
  "note": "Lunch",
  "clientOpId": "uuid"
}
```

## Validation Rules (zod summary)
- `amount`: integer, positive.
- `type`: enum `income | expense`.
- `accountId`, `clientOpId`: uuid.
- `occurredAt`: ISO datetime.
- `category`: non-empty string.

## Error Contract
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "amount must be > 0", "fields": { "amount": "positive integer required" } } }
```


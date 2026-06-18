# bookings module

> Advisor session bookings.

**Base path:** `/api/v1/bookings`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/bookings` | auth | `—` |
| GET | `/bookings` | auth | `BookingController.getBookings` |
| GET | `/bookings/:id` | auth | `BookingController.getBooking` |
| PUT | `/bookings/:id/accept` | auth | `—` |
| PUT | `/bookings/:id/reject` | auth | `—` |
| PUT | `/bookings/:id/reschedule` | auth | `—` |
| PUT | `/bookings/:id/cancel` | auth | `—` |
| GET | `/bookings/workspace/clients` | auth | `—` |
| POST | `/bookings/:bookingId/fee/pay` | auth | `—` |

## Files

- `booking.controller.ts`
- `booking.routes.ts`
- `booking.validation.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `bookings/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._

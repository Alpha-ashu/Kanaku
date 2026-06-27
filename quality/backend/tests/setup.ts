import path from 'path';
import { config } from 'dotenv';

// Tests live in quality/backend/tests/; the env file stays in backend/.
config({ path: path.resolve(__dirname, '../../../backend/.env.test') });

// The Account-Aggregator router is mount-gated OFF by default in production
// (see src/routes/index.ts), but the integration suite exercises it, so opt it
// in for tests unless the runner already configured ENABLED_MODULES.
process.env.ENABLED_MODULES = process.env.ENABLED_MODULES || 'aa';

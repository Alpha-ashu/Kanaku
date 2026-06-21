import { createClient } from '@supabase/supabase-js';

// Falls back to the project's PUBLIC values (browser-safe anon/publishable key +
// public project URL — both are meant to ship in the client bundle) so auth works
// even when the Vercel env vars aren't set. Real env vars override these.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mmwrckfqeqjfqciymemh.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || 'sb_publishable_QA4aNzLgHR9xanXUJaPpew_XGRicYBq';
let hasWarnedMissingConfig = false;

// Warn if someone accidentally uses the server-side secret key in the browser.
// sb_secret_ keys are for server-side use only and will cause auth failures.
// The correct browser key is either sb_publishable_... (new format) or eyJ... (JWT anon key).
if (supabaseKey && supabaseKey.startsWith('sb_secret_')) {
	console.error(
		' SUPABASE KEY ERROR: VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY is set to a server-side ' +
		'"secret" key (sb_secret_...). This key must NEVER be used in the browser.\n\n' +
		'HOW TO FIX:\n' +
		'1. Go to your Supabase dashboard  Project Settings  API\n' +
		'2. Copy the "anon / public" key (sb_publishable_... or eyJ...)\n' +
		'3. Replace VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY in your .env with that key\n' +
		'4. Restart the dev server (npm run dev)'
	);
}


// Create a stub client for when env vars are missing
const createStubClient = (): any => {
	if (!hasWarnedMissingConfig) {
		hasWarnedMissingConfig = true;
		console.warn(
			'Supabase configuration is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY in your environment.',
		);
	}

	return {
		auth: {
			getSession: async () => ({ data: { session: null }, error: null }),
			getUser: async () => ({ data: { user: null }, error: null }),
			signUp: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase not configured', status: 500 } }),
			signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase not configured', status: 500 } }),
			signInWithOAuth: async () => ({ data: { provider: null, url: null }, error: { message: 'Supabase not configured', status: 500 } }),
			signInWithOtp: async () => ({ data: {}, error: null }),
			verifyOtp: async () => ({ data: {}, error: null }),
			signOut: async () => ({ error: null }),
			onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
			startAutoRefresh: () => Promise.resolve(),
			stopAutoRefresh: () => Promise.resolve(),
		},
		from: () => ({
			select: () => ({ data: null, error: { message: 'Supabase not configured', status: 500 } }),
			insert: () => ({ data: null, error: { message: 'Supabase not configured', status: 500 } }),
			update: () => ({ data: null, error: { message: 'Supabase not configured', status: 500 } }),
			delete: () => ({ data: null, error: { message: 'Supabase not configured', status: 500 } }),
		}),
	};
};

// Auth source of truth. When 'supabase' (Option A), Supabase Auth owns the
// session, so it MUST be persisted + auto-refreshed (otherwise getSession()
// returns null right after login and every API call is unauthenticated).
// In the default hybrid/custom mode the custom JWT is canonical, so we keep the
// Supabase session non-persistent (AuthContext manages any refresh) to avoid
// console-flooding retries when the Supabase project is paused.
const supabaseCanonical = (import.meta.env.VITE_AUTH_CANONICAL || 'backend') === 'supabase';

const supabase = (!supabaseUrl || !supabaseKey)
	? createStubClient()
	: createClient(supabaseUrl, supabaseKey, {
		auth: supabaseCanonical
			? {
				autoRefreshToken: true,
				persistSession: true,
				detectSessionInUrl: true,
			}
			: {
				autoRefreshToken: false,
				persistSession: false,
				detectSessionInUrl: true,
				storage: {
					getItem: () => null,
					setItem: () => {},
					removeItem: () => {},
				},
			},
	});

export default supabase;

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
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

// autoRefreshToken is set to false here.
// AuthContext.tsx is responsible for calling startAutoRefresh() only AFTER a
// successful getSession() confirms Supabase is actually reachable, and for
// stopping it when the component unmounts or the network goes offline.
// This prevents the setInterval retry loop from flooding the console when the
// Supabase project is paused or the server is unreachable.
const supabase = (!supabaseUrl || !supabaseKey)
	? createStubClient()
	: createClient(supabaseUrl, supabaseKey, {
		auth: {
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

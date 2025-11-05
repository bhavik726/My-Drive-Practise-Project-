// config/supabase.config.js
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('Missing Supabase URL or Key in environment variables');
}

// Use env var if present, otherwise default to 'uploads'
const BUCKET = process.env.SUPABASE_BUCKET || 'uploads';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

// Quick check that the bucket exists. Do NOT crash the app if bucket missing;
// instead provide a clear warning so the server can start and we can surface
// a helpful error when operations occur.
async function testSupabaseConnection() {
    try {
        const { data, error } = await supabase.storage.getBucket(BUCKET);
        if (error) {
            // If it's a 404 (not found), warn and continue. Other errors we'll log.
            if (error.status === 404 || error.statusCode === '404') {
                console.warn(`Supabase bucket '${BUCKET}' not found. Create it in the Supabase dashboard or set SUPABASE_BUCKET to an existing bucket.`);
                return;
            }
            throw error;
        }
        console.log(`Successfully connected to Supabase Storage and found bucket '${BUCKET}'`);
    } catch (err) {
        console.error('Supabase connection error:', err.message || err);
        // Do not re-throw here to avoid crashing the whole app on missing bucket.
    }
}

// Run the test immediately (non-blocking)
testSupabaseConnection();

module.exports = { supabase, bucket: BUCKET }

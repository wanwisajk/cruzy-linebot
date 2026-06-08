const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase environment variables are not fully configured.');
}

const supabase = createClient(
  supabaseUrl || 'https://example.supabase.co',
  supabaseKey || 'missing-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

module.exports = {
  supabase,
};

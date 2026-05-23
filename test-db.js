// No dotenv needed, using node --env-file
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  },
  realtime: {
    transport: ws
  }
});

async function test() {
  const { data, error } = await supabase.from('settings').select('*').limit(1);
  if (error) {
    if (error.code === '42P01') {
      console.log("SUCCESS_CONNECT_BUT_NO_TABLES");
    } else {
      console.error("ERROR:", error.message);
    }
  } else {
    console.log("SUCCESS_DATA:", data);
  }
}

test();

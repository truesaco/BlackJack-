// One shared Supabase client for every page (game, profile, stats).
// The publishable key is designed to be public; access is enforced by row-level security.
(() => {
  const SUPABASE_URL = "https://ahftbaykwpegkcpftiam.supabase.co";
  const SUPABASE_KEY = "sb_publishable_xC7vKxnh2oRdsid6syIc4A_JcpT42L-";
  window.sbClient =
    window.supabase && window.supabase.createClient
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
      : null;
})();

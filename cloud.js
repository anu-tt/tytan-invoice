const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anonKey } = import.meta.env;
const $ = id => document.getElementById(id);

function message(text) {
  $('authMsg').textContent = text || '';
}

function lock() {
  $('authView').style.display = 'grid';
  $('appView').classList.add('hidden');
  setSyncStatus('Sign in to access your invoices', 'pending');
}

async function enter(user, sb) {
  window.setInvoiceAccount(user.id);
  $('authView').style.display = 'none';
  $('appView').classList.remove('hidden');
  $('logoutBtn').classList.remove('hidden');
  $('syncNowBtn').disabled = false;
  $('userEmail').textContent = user.email || '';
  window.TYTAN_SUPABASE = sb;
  window.dispatchEvent(new Event('tytan-cloud-ready'));
  if (!navigator.onLine) setSyncStatus('Offline · local changes will sync when connected', 'offline');
}

if (!url || !anonKey) {
  lock();
  message('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local, then restart the app.');
  $('authSubmit').disabled = true;
  $('authEmail').disabled = true;
  $('authPassword').disabled = true;
} else if (!window.supabase) {
  lock();
  message('Supabase client failed to load. Check your network connection and reload.');
} else {
  const sb = window.supabase.createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  $('authForm').onsubmit = async event => {
    event.preventDefault();
    const submit = $('authSubmit');
    submit.disabled = true;
    submit.classList.add('is-loading');
    submit.textContent = 'Signing in…';
    message('Connecting securely…');
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    try {
      const result = await sb.auth.signInWithPassword({ email, password });
      if (result.error) message(result.error.message);
      else message('');
    } catch (error) {
      message(`Could not connect: ${error.message}`);
    } finally {
      submit.disabled = false;
      submit.classList.remove('is-loading');
      submit.textContent = 'Login';
    }
  };
  $('logoutBtn').onclick = async () => {
    const { error } = await sb.auth.signOut();
    if (error) message(error.message);
  };

  const { data, error } = await sb.auth.getSession();
  if (error) {
    lock();
    message(error.message);
  } else if (data.session) {
    await enter(data.session.user, sb);
  } else {
    lock();
  }
  sb.auth.onAuthStateChange((_event, session) => {
    if (session) void enter(session.user, sb);
    else { window.setInvoiceAccount(null); lock(); }
  });
}

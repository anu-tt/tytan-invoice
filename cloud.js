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

function createMockSupabase() {
  const MOCK_SESSION_KEY = 'tytan_mock_session_v1';
  const MOCK_DB_KEY = 'tytan_mock_db_v1';
  const listeners = new Set();

  function getMockDb() {
    try {
      return JSON.parse(localStorage.getItem(MOCK_DB_KEY) || 'null') || {
        companies: [{
          id: 'company_demo',
          name: 'Anil Enterprises',
          location: 'Okdenganj, Sadev Katra (Ballia)',
          phone: '8318886379',
          email: 'tytandoor@gmail.com',
          website: 'www.tytandoor.com',
          proprietor: 'Khushir Gupta',
          invoice_prefix: 'INV-',
          next_invoice_no: 1
        }],
        invoices: []
      };
    } catch {
      return { companies: [], invoices: [] };
    }
  }

  function saveMockDb(db) {
    try {
      localStorage.setItem(MOCK_DB_KEY, JSON.stringify(db));
    } catch (e) {
      console.warn('Failed to save mock db', e);
    }
  }

  function getSession() {
    try {
      const saved = localStorage.getItem(MOCK_SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }

  function notifyAuth(event, session) {
    for (const cb of listeners) {
      try { cb(event, session); } catch (e) { console.error(e); }
    }
  }

  return {
    isMock: true,
    auth: {
      async signInWithPassword({ email }) {
        const user = {
          id: 'local_user_' + (email ? email.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() : 'demo'),
          email: email || 'tytandoor@gmail.com'
        };
        const session = { user, access_token: 'mock-jwt-token' };
        localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(session));
        notifyAuth('SIGNED_IN', session);
        return { data: { user, session }, error: null };
      },
      async signOut() {
        localStorage.removeItem(MOCK_SESSION_KEY);
        notifyAuth('SIGNED_OUT', null);
        return { error: null };
      },
      async getSession() {
        const session = getSession();
        return { data: { session }, error: null };
      },
      async getUser() {
        const session = getSession();
        return { data: { user: session?.user || null }, error: null };
      },
      onAuthStateChange(cb) {
        listeners.add(cb);
        return {
          data: {
            subscription: {
              unsubscribe() { listeners.delete(cb); }
            }
          }
        };
      }
    },
    async rpc(funcName) {
      if (funcName === 'claim_company') {
        const db = getMockDb();
        if (!db.companies[0]) {
          db.companies.push({
            id: 'company_demo',
            name: 'Anil Enterprises',
            location: 'Okdenganj, Sadev Katra (Ballia)',
            phone: '8318886379',
            email: 'tytandoor@gmail.com',
            website: 'www.tytandoor.com',
            proprietor: 'Khushir Gupta',
            invoice_prefix: 'INV-',
            next_invoice_no: 1
          });
          saveMockDb(db);
        }
        return { data: db.companies[0].id, error: null };
      }
      return { data: null, error: null };
    },
    from(tableName) {
      let db = getMockDb();
      let table = db[tableName] || [];
      let filters = [];
      let sortCol = null;
      let sortAsc = true;

      const queryBuilder = {
        select() { return queryBuilder; },
        eq(col, val) {
          filters.push(row => row[col] === val);
          return queryBuilder;
        },
        not(col, op, val) {
          if (op === 'is' && val === null) {
            filters.push(row => row[col] !== null && row[col] !== undefined);
          }
          return queryBuilder;
        },
        order(col, opts = {}) {
          sortCol = col;
          sortAsc = opts.ascending !== false;
          return queryBuilder;
        },
        async single() {
          const res = await queryBuilder.then(r => r);
          return { data: res.data?.[0] || null, error: null };
        },
        async update(patch) {
          db = getMockDb();
          const targetTable = db[tableName] || [];
          for (let i = 0; i < targetTable.length; i++) {
            if (filters.every(f => f(targetTable[i]))) {
              targetTable[i] = { ...targetTable[i], ...patch };
            }
          }
          db[tableName] = targetTable;
          saveMockDb(db);
          return { data: patch, error: null };
        },
        async upsert(payload) {
          db = getMockDb();
          const targetTable = db[tableName] || [];
          const idx = targetTable.findIndex(row => row.id === payload.id);
          if (idx >= 0) targetTable[idx] = { ...targetTable[idx], ...payload };
          else targetTable.push(payload);
          db[tableName] = targetTable;
          saveMockDb(db);
          return { data: payload, error: null };
        },
        async delete() {
          db = getMockDb();
          const targetTable = db[tableName] || [];
          db[tableName] = targetTable.filter(row => !filters.every(f => f(row)));
          saveMockDb(db);
          return { data: null, error: null };
        },
        then(resolve, reject) {
          let rows = [...table];
          for (const f of filters) {
            rows = rows.filter(f);
          }
          if (sortCol) {
            rows.sort((a, b) => {
              const va = a[sortCol] || '';
              const vb = b[sortCol] || '';
              return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
            });
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        }
      };
      return queryBuilder;
    },
    channel() {
      const channelObj = {
        on() { return channelObj; },
        subscribe() { return channelObj; }
      };
      return channelObj;
    }
  };
}

let sb;
if (url && anonKey && window.supabase) {
  sb = window.supabase.createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
} else {
  sb = createMockSupabase();
  if (!$('authEmail').value) $('authEmail').value = 'tytandoor@gmail.com';
  if (!$('authPassword').value) $('authPassword').value = 'tytandoor123';
  message('Local mode active · Sign in to start managing invoices (or set Supabase keys in .env.local)');
}

$('authForm').onsubmit = async event => {
  event.preventDefault();
  const submit = $('authSubmit');
  submit.disabled = true;
  submit.classList.add('is-loading');
  submit.textContent = 'Signing in…';
  message('Connecting…');
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
} else if (data && data.session) {
  await enter(data.session.user, sb);
} else {
  lock();
}
sb.auth.onAuthStateChange((_event, session) => {
  if (session) void enter(session.user, sb);
  else { window.setInvoiceAccount(null); lock(); }
});

/**
 * QuizForge — Index Page Script (app.js)
 * Handles: Registration, Login, Test Browse
 */

// ── Helpers ───────────────────────────────────────────
const esc = s => !s ? '' : String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const $ = id => document.getElementById(id);
const toast = (msg, type='info') => {
  const w = document.querySelector('.toast-wrap') || (() => {
    const d = document.createElement('div');
    d.className = 'toast-wrap'; document.body.appendChild(d); return d;
  })();
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  w.appendChild(t);
  setTimeout(() => t.remove(), 3000);
};

const LABELS = { 'mcq-single':'MCQ', 'mcq-multi':'Multi-Select', 'short':'Short Ans', 'long':'Long Ans' };
const qtBadge = t => `<span class="badge b-${t==='mcq-single'?'blue':t==='mcq-multi'?'amber':t==='short'?'green':'gray'}">${LABELS[t]||t}</span>`;

// ── Main Init ─────────────────────────────────────────
function init() {
  if (Auth.isLoggedIn()) {
    showHome();
  } else {
    showAuth();
  }
}

// ═══════════════════════════════════════════════════════
//  AUTH SCREEN
// ═══════════════════════════════════════════════════════
function showAuth() {
  $('screen-auth').style.display = 'flex';
  $('screen-home').style.display = 'none';
  renderAuthTabs('register');
}

function renderAuthTabs(active) {
  const body = $('auth-panel-body');
  body.innerHTML = `
    <div class="auth-tabs">
      <button class="auth-tab ${active==='register'?'active':''}" onclick="renderAuthTabs('register')">New Registration</button>
      <button class="auth-tab ${active==='login'?'active':''}" onclick="renderAuthTabs('login')">Already Registered</button>
    </div>
    <div class="auth-body">
      ${active === 'register' ? renderRegForm() : renderLoginForm()}
    </div>`;
}

function renderRegForm() {
  return `
    <form class="auth-form" onsubmit="handleRegister(event)">
      <div class="fld">
        <label>Full Name *</label>
        <input class="inp" id="reg-name" placeholder="e.g. Naitik Sharma" autocomplete="name" required>
      </div>
      <div class="g2">
        <div class="fld">
          <label>Date of Birth *</label>
          <input class="inp" id="reg-dob" type="date" required>
        </div>
        <div class="fld">
          <label>Roll Number * <span style="font-weight:400;color:var(--text-dim)">(6 digits)</span></label>
          <input class="inp" id="reg-roll" type="text" inputmode="numeric" maxlength="6"
            placeholder="e.g. 240001" oninput="checkRoll(this)">
          <span class="roll-hint" id="roll-hint">Create your own unique 6-digit number</span>
        </div>
      </div>
      <div class="req-google">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Google Sign-in is mandatory for identity verification
      </div>
      <button type="button" class="btn-google" id="reg-google-btn" onclick="handleGoogleAuth('reg-google-btn')">
        <svg class="google-icon" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in with Google
      </button>
      <div id="reg-err" class="fld-err" style="display:none"></div>
      <button type="submit" class="btn btn-primary btn-block btn-lg" id="reg-submit-btn">
        Register &amp; Enter
      </button>
      <p class="auth-note">Your roll number is your permanent ID — remember it for future logins.</p>
    </form>`;
}

function renderLoginForm() {
  return `
    <form class="auth-form" onsubmit="handleLogin(event)">
      <div class="fld">
        <label>Roll Number *</label>
        <input class="inp" id="login-roll" type="text" inputmode="numeric"
          maxlength="6" placeholder="Your 6-digit roll number" required>
      </div>
      <button type="button" class="btn-google" id="login-google-btn" onclick="handleGoogleAuth('login-google-btn')">
        <svg class="google-icon" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in with Google
      </button>
      <div id="login-err" class="fld-err" style="display:none"></div>
      <button type="submit" class="btn btn-primary btn-block btn-lg">Login</button>
    </form>`;
}

function checkRoll(inp) {
  const val = inp.value.replace(/\D/g,'');
  inp.value = val;
  const hint = $('roll-hint'); if(!hint) return;
  if (!val) { hint.className='roll-hint'; hint.textContent='Create your own unique 6-digit number'; return; }
  if (val.length < 6) { hint.className='roll-hint'; hint.textContent=`${val.length}/6 digits`; return; }
  hint.className='roll-hint ok'; hint.textContent='✓ Format valid';
}

async function handleGoogleAuth(btnId) {
  const btn = $(btnId); if(!btn) return;
  const result = await Auth.signInWithGoogle(btn);
  if (!result.success) {
    toast(result.error || 'Google sign-in failed', 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const errEl = $('reg-err');
  const result = await Auth.register({
    name:   $('reg-name')?.value,
    dob:    $('reg-dob')?.value,
    rollNo: $('reg-roll')?.value,
  });
  if (result.error) {
    errEl.textContent = result.error; errEl.style.display = 'block';
    return;
  }
  toast('Registration successful!', 'success');
  showHome();
}

async function handleLogin(e) {
  e.preventDefault();
  const errEl = $('login-err');
  const result = await Auth.loginByRoll($('login-roll')?.value?.trim());
  if (result.error) {
    errEl.textContent = result.error; errEl.style.display = 'block';
    return;
  }
  toast('Welcome back!', 'success');
  showHome();
}

// ═══════════════════════════════════════════════════════
//  STUDENT HOME — Test Browse
// ═══════════════════════════════════════════════════════
function showHome() {
  const student = Auth.getStudent();
  if (!student) { showAuth(); return; }

  $('screen-auth').style.display = 'none';
  $('screen-home').style.display = 'block';

  // Student info bar
  $('bar-name').textContent  = student.name;
  $('bar-roll').textContent  = student.rollNo;
  $('bar-email').textContent = student.googleEmail || '';

  renderTests('');
}

async function renderTests(query) {
  const student = Auth.getStudent();
  const grid = $('tests-grid');
  grid.innerHTML = '<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>';
  
  const tests = await DB.getTests();
  const q = (query || '').toLowerCase();
  // Since active tests are returned by getTests in standard view, we just filter by query
  const filtered = q ? tests.filter(t => t.title.toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q)) : tests;
  
  // also get submissions to check if attempted
  const subsRes = await DB.getAdminSubmissions();
  const mySubs = (subsRes.submissions || []).filter(s => s.rollNo === student.rollNo);
  const attemptedIds = new Set(mySubs.map(s => s.testId));

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty-icon">📋</div>
      <h3>${q ? 'No tests match your search' : 'No tests available'}</h3>
      <p>${q ? 'Try a different keyword' : 'Tests will appear here when activated by admin'}</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(t => {
    const maxMarks = t.questions.reduce((s,q)=>s+q.marks,0);
    const attempted = attemptedIds.has(t.id);
    const qTypes = [...new Set(t.questions.map(q=>q.type))];
    return `
      <div class="test-card">
        <div class="tc-title">${esc(t.title)}</div>
        ${t.description ? `<div class="tc-desc">${esc(t.description)}</div>` : ''}
        <div class="tc-meta">
          <span class="badge b-amber">⏱ ${t.duration} min</span>
          <span class="badge b-blue">📝 ${t.questions.length} Questions</span>
          <span class="badge b-gray">Max ${maxMarks} marks</span>
          ${qTypes.map(qt=>qtBadge(qt)).join('')}
        </div>
        <div class="tc-marking">
          <span><span style="color:var(--green)">+${t.marking.correct}</span> Correct</span>
          <span><span style="color:var(--red)">−${t.marking.incorrect}</span> Incorrect</span>
          ${t.marking.unanswered > 0 ? `<span><span style="color:var(--text-muted)">−${t.marking.unanswered}</span> Unanswered</span>` : '<span style="color:var(--text-muted)">No penalty unanswered</span>'}
        </div>
        <div class="tc-footer">
          ${attempted
            ? `<div class="tc-attempted">✓ Already Attempted — <a href="index.html" style="color:var(--green);cursor:default">submitted</a></div>`
            : `<button class="btn btn-primary btn-block" onclick="startTest('${t.id}')">Start Test →</button>`}
        </div>
      </div>`;
  }).join('');
}

async function startTest(testId) {
  const student = Auth.getStudent();
  if (!student) { showAuth(); return; }

  const test = await DB.getTest(testId);
  if (!test || !test.active) { toast('This test is no longer available.', 'error'); return; }
  
  const subsRes = await DB.getAdminSubmissions();
  const mySubs = (subsRes.submissions || []).filter(s => s.rollNo === student.rollNo);
  
  if (mySubs.some(s => s.testId === testId)) {
    toast('You have already attempted this test.', 'error'); return;
  }

  window.location.href = `test.html?id=${testId}`;
}

function doLogout() {
  Auth.logout();
  showAuth();
}

// ── Boot ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
window.renderAuthTabs = renderAuthTabs;
window.handleGoogleAuth = handleGoogleAuth;
window.handleRegister = handleRegister;
window.handleLogin = handleLogin;
window.checkRoll = checkRoll;
window.startTest = startTest;
window.doLogout = doLogout;
window.renderTests = renderTests;

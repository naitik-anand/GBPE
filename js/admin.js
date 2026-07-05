/**
 * QuizForge — Admin Panel Script (admin.js)
 * Access: /admin.html only.
 */

// ── State ─────────────────────────────────────────────
const A = {
  loggedIn: false,
  view: 'dashboard',          // dashboard | edit-test | results | all-subs
  editTestId: null,
  editQ: null,
  resultTestId: null,
};

// ── Helpers ───────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => !s ? '' : String(s)
  .replace(/&/g,'&amp;')
  .replace(/</g,'<')
  .replace(/>/g,'>')
  .replace(/"/g,'"');

const LETTERS = ['A','B','C','D','E','F'];
const QTYPES  = {'mcq-single':'MCQ Single','mcq-multi':'Multi-Select','short':'Short Ans','long':'Long Ans'};

function badge(type) {
  const map = {'mcq-single':'b-blue','mcq-multi':'b-amber','short':'b-green','long':'b-gray'};
  return `<span class="badge ${map[type]||'b-gray'}">${QTYPES[type]||type}</span>`;
}

function toast(msg, type='info') {
  const w = $('toast-wrap');
  if (!w) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`; 
  t.textContent = msg;
  w.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// Very small markdown subset used across admin + test.
function parseMD(str) {
  if (!str) return '';
  let html = esc(str);
  html = html.replace(/!\[([^\]]+)\]\(([^\)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:4px;margin:8px 0;max-height:200px;object-fit:contain;display:block">');
  html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--blue);text-decoration:underline">$1</a>');
  return html;
}

// ═══════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════
async function init() {
  // Ask the server whether this browser actually has an authenticated admin
  // session — sessionStorage alone can be set by hand in devtools, so it's
  // not something the app should trust for gating the real admin API.
  const isAdmin = await DB.checkAdminSession();
  if (isAdmin) { A.loggedIn = true; showAdmin(); }
  else { $('admin-login').style.display='flex'; $('admin-shell').style.display='none'; }
}

async function doLogin(e) {
  e.preventDefault();
  const pw = $('admin-pw')?.value;
  const res = await DB.checkAdminPw(pw);
  if (res && res.success) {
    // Server has set the session cookie at this point — no local flag needed.
    A.loggedIn = true; showAdmin();
  } else {
    const err = $('login-err');
    if (err) { err.textContent = '❌ Incorrect password'; err.style.display='block'; }
  }
}

async function doLogout() {
  await DB.adminLogout();
  A.loggedIn = false;
  $('admin-login').style.display='flex';
  $('admin-shell').style.display='none';
}

function showAdmin() {
  $('admin-login').style.display='none';
  $('admin-shell').style.display='flex';
  renderDashboard();
}

// ═══════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════
async function renderDashboard() {
  A.view = 'dashboard';
  const content = $('admin-content');
  content.innerHTML = '<div style="padding:100px;text-align:center"><div class="spinner"></div></div>';

  try {
    const tests = await DB.getAdminTests();
    const subsRes = await DB.getAdminSubmissions();
    const subs = subsRes.submissions || [];

    content.innerHTML = `
      <div class="flex-between mb8" style="margin-bottom:20px">
        <h1 style="font-size:20px;font-weight:700">Tests</h1>
        <button class="btn btn-primary" onclick="createTest()">+ New Test</button>
      </div>
      <div class="stats-row" style="margin-bottom:24px">
        <div class="stat-card"><div class="s-val" style="color:var(--accent)">${tests.length}</div><div class="s-lbl">Total Tests</div></div>
        <div class="stat-card"><div class="s-val" style="color:var(--green)">${tests.filter(t=>t.active).length}</div><div class="s-lbl">Active</div></div>
        <div class="stat-card"><div class="s-val" style="color:var(--blue)">${subs.length}</div><div class="s-lbl">Submissions</div></div>
      </div>
      <div class="admin-grid" id="test-grid"></div>
      <div style="margin-top:24px">
        <button class="btn btn-ghost" onclick="openAllSubmissions()">📋 View All Submissions</button>
      </div>`;

    renderTestGrid(tests, subs);
  } catch (e) {
    content.innerHTML = '<div class="empty">Failed to load dashboard</div>';
  }
}

function renderTestGrid(tests, allSubs) {
  const grid = $('test-grid');
  if (!tests.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty-icon">📋</div><h3>No tests yet</h3>
      <p>Create your first test to get started</p>
    </div>`;
    return;
  }

  grid.innerHTML = tests.map(t => {
    const subs = allSubs.filter(s => s.testId === t.id);
    const maxMarks = (t.questions || []).reduce((sum,q)=>sum + (q.marks||0), 0);
    return `
      <div class="admin-card">
        <div class="ac-title">${esc(t.title)||'<em style="color:var(--text-muted)">Untitled</em>'}</div>
        <div class="ac-meta">
          <span class="badge b-amber">⏱ ${t.duration}m</span>
          <span class="badge b-blue">📝 ${(t.questions||[]).length}Q</span>
          <span class="badge b-gray">${maxMarks} marks</span>
          <span class="badge ${t.active?'b-green':'b-gray'}">${t.active?'Active':'Draft'}</span>
        </div>
        ${t.description ? `<div style="font-size:12px;color:var(--text-muted);line-height:1.5">${esc(t.description)}</div>` : ''}
        <div class="toggle-wrap">
          <div class="toggle ${t.active?'on':''}" onclick="toggleActive('${t.id}')"></div>
          ${t.active ? '<span style="color:var(--green)">Published</span>' : '<span>Draft</span>'}
        </div>
        <div class="ac-actions">
          <button class="btn btn-ghost btn-sm" onclick="openTestEditor('${t.id}')">✏️ Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="openResults('${t.id}')">📊 Results (${subs.length})</button>
          <button class="btn-icon del" onclick="deleteTest('${t.id}')">🗑</button>
        </div>
      </div>`;
  }).join('');
}

async function toggleActive(id) {
  const t = await DB.getAdminTest(id);
  if (!t) return;
  t.active = !t.active;
  await DB.saveTest(t);
  renderDashboard();
  toast(t.active ? 'Test published' : 'Test set to draft', t.active ? 'success' : 'info');
}

async function createTest() {
  const t = DB.createTest();
  await DB.saveTest(t);
  A.editTestId = t.id;
  openTestEditor(t.id);
}

async function deleteTest(id) {
  if (!confirm('Delete this test and all its data? This cannot be undone.')) return;
  await DB.deleteTest(id);
  renderDashboard();
  toast('Test deleted', 'info');
}

// ═══════════════════════════════════════════════════════
// TEST EDITOR
// ═══════════════════════════════════════════════════════
async function openTestEditor(id) {
  A.editTestId = id;
  A.view = 'edit-test';

  const content = $('admin-content');
  content.innerHTML = '<div style="padding:100px;text-align:center"><div class="spinner"></div></div>';

  const t = await DB.getAdminTest(id);
  if (!t) { content.innerHTML = '<div class="empty">Test not found</div>'; return; }

  const bc = $('breadcrumb');
  if (bc) bc.innerHTML = `<a onclick="renderDashboard()">Tests</a> › <span>${esc(t.title)||'New Test'}</span>`;

  content.innerHTML = `
    <div class="flex-between" style="margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:10px">
        <button class="btn btn-ghost btn-sm" onclick="renderDashboard()">← Back</button>
        <h1 style="font-size:19px;font-weight:700">${esc(t.title)||'New Test'}</h1>
      </div>
      <button class="btn btn-primary" onclick="saveTestMeta()">💾 Save Changes</button>
    </div>

    <div class="editor-layout">
      <div class="editor-main">
        <div class="sec-box">
          <div class="sec-hdr">Test Details</div>
          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="fld"><label>Title *</label><input class="inp" id="t-title" value="${esc(t.title)}" placeholder="e.g. Physics Chapter 5 Test"></div>
            <div class="fld"><label>Description</label><textarea class="txta" id="t-desc" rows="2">${esc(t.description)}</textarea></div>
            <div class="g2">
              <div class="fld"><label>Duration (minutes)</label><input class="inp" type="number" id="t-dur" value="${t.duration}" min="1"></div>
            </div>

            <div class="sec-hdr" style="margin-top:4px">Marking Scheme</div>
            <div class="g2">
              <div class="fld"><label>Correct (+)</label><input class="inp" type="number" id="t-mc" value="${t.marking.correct ?? 4}" min="0" step="0.5"></div>
              <div class="fld"><label>Incorrect (−)</label><input class="inp" type="number" id="t-mi" value="${t.marking.incorrect ?? 1}" min="0" step="0.5"></div>
              <div class="fld"><label>Unanswered (−)</label><input class="inp" type="number" id="t-mu" value="${t.marking.unanswered ?? 0}" min="0" step="0.5"></div>
            </div>

            <div class="fld">
              <label>Question Paper PDF (Optional)</label>
              <input type="file" id="t-pdf" class="inp" accept="application/pdf" style="padding: 6px; font-size: 13px;">
              ${t.has_pdf || t.pdf_data ? `<div style="font-size:12px;color:var(--green);margin-top:4px">✓ PDF attached. Uploading a new one will replace it.</div>` : ''}
            </div>
          </div>
        </div>

        <div class="sec-box">
          <div class="sec-hdr">Questions (${(t.questions||[]).length})</div>
          <div id="q-list">${renderQList(t)}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
            <button class="btn btn-blue btn-sm" onclick="openQEditor('mcq-single')">+ MCQ (Single)</button>
            <button class="btn btn-blue btn-sm" onclick="openQEditor('mcq-multi')">+ MCQ (Multi)</button>
            <button class="btn btn-ghost btn-sm" onclick="openQEditor('short')">+ Short Ans</button>
            <button class="btn btn-ghost btn-sm" onclick="openQEditor('long')">+ Long Ans</button>
          </div>
        </div>
      </div>

      <div class="editor-sidebar">
        <div class="sec-box">
          <div class="sec-hdr">Summary</div>
          ${[
            ['Questions', (t.questions||[]).length],
            ['Max Marks', (t.questions||[]).reduce((s,q)=>s+(q.marks||0),0)],
            ['Duration', t.duration + ' min'],
            ['MCQ Single', (t.questions||[]).filter(q=>q.type==='mcq-single').length],
            ['Multi-Sel', (t.questions||[]).filter(q=>q.type==='mcq-multi').length],
            ['Subjective', (t.questions||[]).filter(q=>q.type==='short'||q.type==='long').length],
          ].map(([k,v])=>`<div class="summary-row"><span class="s-key">${k}</span><span class="s-val">${v}</span></div>`).join('')}
        </div>
        <div class="sec-box" style="border-color:var(--accent);background:var(--accent-dim)">
          <div class="sec-hdr" style="color:var(--accent)">Notes</div>
          <ul style="font-size:12px;color:var(--text-muted);line-height:2;padding-left:16px">
            <li>Multi-select: all correct options required</li>
            <li>Activate test to make it visible</li>
            <li>Add solutions for post-test review</li>
          </ul>
        </div>
      </div>
    </div>`;
}

function renderQList(t) {
  if (!t.questions || !t.questions.length)
    return `<div style="color:var(--text-muted);font-size:13px;padding:16px 0">No questions yet.</div>`;

  return t.questions.map((q,i)=>`
    <div class="q-item">
      <div class="q-item-num">Q${i+1}</div>
      <div class="q-item-body">
        <div style="display:flex;gap:6px;margin-bottom:5px;flex-wrap:wrap">
          ${badge(q.type)}
          <span class="badge b-green">+${q.marks||0}</span>
          ${(q.negMarks||0)>0 ? `<span class="badge b-red">−${q.negMarks}</span>` : ''}
        </div>
        <div class="q-item-text">${esc((q.text||'').slice(0,120))}${(q.text||'').length>120?'…':''}</div>
        <div class="q-item-acts">
          <button class="btn-icon" onclick="openQEditor(null,'${q.id}')">✏️ Edit</button>
          <button class="btn-icon del" onclick="deleteQ('${q.id}')">🗑 Delete</button>
        </div>
      </div>
    </div>`).join('');
}

async function saveTestMeta() {
  const t = await DB.getAdminTest(A.editTestId);
  if (!t) return;

  const title = $('t-title')?.value.trim();
  if (!title) { toast('Please enter a title', 'error'); return; }

  t.title = title;
  t.description = $('t-desc')?.value.trim() || '';
  t.duration = parseInt($('t-dur')?.value) || 30;
  t.marking.correct = parseFloat($('t-mc')?.value) || 4;
  t.marking.incorrect = parseFloat($('t-mi')?.value) || 1;
  t.marking.unanswered = parseFloat($('t-mu')?.value) || 0;

  const pdfInput = $('t-pdf');
  if (pdfInput && pdfInput.files.length > 0) {
    const file = pdfInput.files[0];
    if (file.size > 2 * 1024 * 1024) { toast('PDF must be smaller than 2MB', 'error'); return; }

    const reader = new FileReader();
    reader.onload = async (e) => {
      t.pdf_data = e.target.result;
      await DB.saveTest(t);
      toast('Saved with PDF!', 'success');
      openTestEditor(t.id);
    };
    reader.readAsDataURL(file);
    toast('Uploading file...', 'info');
    return;
  }

  await DB.saveTest(t);
  toast('Saved!', 'success');
  openTestEditor(t.id);
}

async function deleteQ(qid) {
  if (!confirm('Delete this question?')) return;
  const t = await DB.getAdminTest(A.editTestId);
  if (!t) return;
  t.questions = (t.questions||[]).filter(q=>q.id!==qid);
  await DB.saveTest(t);
  $('q-list').innerHTML = renderQList(t);
  toast('Question deleted');
}

// ── Question Editor ───────────────────────────────────
async function openQEditor(type, qid) {
  const t = await DB.getAdminTest(A.editTestId);
  if (!t) return;

  if (!$('t-title')?.value.trim() && !t.title) { toast('Save test title first','error'); return; }

  const title = $('t-title')?.value.trim();
  if (title) {
    t.title = title;
    t.duration = parseInt($('t-dur')?.value)||30;
    t.marking.correct = parseFloat($('t-mc')?.value)||4;
    t.marking.incorrect = parseFloat($('t-mi')?.value)||1;
    t.marking.unanswered = parseFloat($('t-mu')?.value)||0;
    await DB.saveTest(t);
  }

  if (qid) {
    A.editQ = JSON.parse(JSON.stringify((t.questions||[]).find(q=>q.id===qid)));
  } else {
    A.editQ = DB.createQuestion(type, t.marking);
    A.editQ._isNew = true;
  }

  renderQModal();
}

function renderQModal() {
  const q = A.editQ;
  let modal = $('q-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'q-modal';
    modal.className = 'overlay';
    document.body.appendChild(modal);
  }

  const isMCQ = q.type.startsWith('mcq');
  const optHTML = isMCQ ? (()=>{
    const isMulti = q.type === 'mcq-multi';
    return `
      <div class="fld" style="margin-bottom:0">
        <label>${isMulti ? 'Options — check ALL correct answers' : 'Options — select ONE correct answer'}</label>
        <div id="opt-list">${q.options.map((o,i)=>renderOptEditor(o,i,q)).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="addOption()" style="margin-top:8px">+ Add Option</button>
      </div>`;
  })() : `
      <div class="fld">
        <label>${q.type==='short'?'Expected Answer':'Model Answer (shown in solutions)'}</label>
        <textarea class="txta" id="q-model-ans" rows="3" placeholder="Model answer...">${esc(q.correct[0]||'')}</textarea>
      </div>`;

  modal.innerHTML = `
    <div class="modal" style="max-width:720px">
      <div class="modal-head">
        <h3>${q._isNew?'Add':'Edit'} Question — ${QTYPES[q.type]||q.type}</h3>
        <button class="btn-icon" onclick="closeQModal()">✕</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="fld">
          <label>Question Text * <span style="font-weight:400;color:var(--text-dim)">(Markdown: [link](url) and ![img](url))</span></label>
          <textarea class="txta" id="q-text" rows="3" placeholder="Type your question..." oninput="updateQPreview()">${esc(q.text)}</textarea>
        </div>

        <div class="fld" id="q-preview-wrap" style="display:none">
          <label>Preview</label>
          <div id="q-preview" style="background:var(--bg);border:1px solid var(--border);padding:12px;border-radius:var(--radius);font-size:14px;line-height:1.7"></div>
        </div>

        ${optHTML}

        <div class="hr"></div>
        <div class="sec-hdr">Marks</div>
        <div class="g2">
          <div class="fld"><label>Marks for Correct (+)</label><input class="inp" type="number" id="q-marks" value="${q.marks||0}" min="0" step="0.5"></div>
          <div class="fld"><label>Negative for Incorrect (−)</label><input class="inp" type="number" id="q-neg" value="${q.negMarks||0}" min="0" step="0.5"></div>
        </div>

        <div class="fld">
          <label>Solution / Explanation (optional) <span style="font-weight:400;color:var(--text-dim)">(Markdown allowed)</span></label>
          <textarea class="txta" id="q-sol" rows="2" placeholder="Explain the answer..." oninput="updateSolPreview()">${esc(q.solution||'')}</textarea>
        </div>

        <div class="fld" id="sol-preview-wrap" style="display:none">
          <label>Solution Preview</label>
          <div id="sol-preview" style="background:var(--bg);border:1px solid var(--border);padding:12px;border-radius:var(--radius);font-size:14px;line-height:1.7"></div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button class="btn btn-ghost" onclick="closeQModal()">Cancel</button>
          <button class="btn btn-primary btn-lg" onclick="saveQ()">Save Question</button>
        </div>
      </div>
    </div>`;

  requestAnimationFrame(()=>{ updateQPreview(); updateSolPreview(); });
}

function renderOptEditor(o,i,q) {
  const isMulti = q.type === 'mcq-multi';
  const isCorrect = isMulti ? (q.correct||[]).includes(o.id) : (q.correct||[])[0] === o.id;

  return `
    <div class="opt-editor-item ${isCorrect?'is-correct':''}" id="oei-${o.id}">
      <div class="opt-letter">${LETTERS[i]}</div>
      <input type="text" value="${esc(o.text)}" placeholder="Option ${LETTERS[i]}" oninput="updateOptText('${o.id}',this.value)">
      ${isMulti
        ? `<input type="checkbox" ${isCorrect?'checked':''} onchange="setCorrectMulti('${o.id}',this.checked)" title="Mark as correct">`
        : `<button type="button" class="btn-icon" onclick="setCorrectSingle('${o.id}')" title="Mark correct" style="color:${isCorrect?'var(--green)':'var(--text-muted)'}">${isCorrect?'✅':'○'}</button>`}
      <button type="button" class="btn-icon del" onclick="removeOpt('${o.id}')">✕</button>
    </div>`;
}

window.updateOptText = (id,v)=>{
  const o = A.editQ.options.find(x=>x.id===id);
  if (o) o.text = v;
};

window.setCorrectSingle = id => {
  A.editQ.correct = [id];
  reRenderOpts();
};

window.setCorrectMulti = (id,checked) => {
  if (checked) { if (!A.editQ.correct.includes(id)) A.editQ.correct.push(id); }
  else { A.editQ.correct = A.editQ.correct.filter(x=>x!==id); }
  reRenderOpts();
};

window.addOption = () => {
  A.editQ.options.push({ id: DB.uid(), text:'' });
  reRenderOpts();
};

window.removeOpt = id => {
  if (A.editQ.options.length <= 2) { toast('Minimum 2 options required','error'); return; }
  A.editQ.options = A.editQ.options.filter(o=>o.id!==id);
  A.editQ.correct = A.editQ.correct.filter(x=>x!==id);
  reRenderOpts();
};

function reRenderOpts() {
  const list = $('opt-list');
  if (!list) return;

  // Sync input values
  A.editQ.options.forEach(o=>{
    const el = document.querySelector(`#oei-${o.id} input[type=text]`);
    if (el) o.text = el.value;
  });

  list.innerHTML = A.editQ.options.map((o,i)=>renderOptEditor(o,i,A.editQ)).join('');
}

function updateQPreview() {
  const wrap = $('q-preview-wrap');
  const box = $('q-preview');
  const txt = $('q-text')?.value;
  if (!wrap || !box) return;
  if (!txt || !txt.trim()) { wrap.style.display='none'; return; }
  wrap.style.display='flex';
  box.innerHTML = parseMD(txt);
}

function updateSolPreview() {
  const wrap = $('sol-preview-wrap');
  const box = $('sol-preview');
  const txt = $('q-sol')?.value;
  if (!wrap || !box) return;
  if (!txt || !txt.trim()) { wrap.style.display='none'; return; }
  wrap.style.display='flex';
  box.innerHTML = parseMD(txt);
}

async function saveQ() {
  const q = A.editQ;
  const t = await DB.getAdminTest(A.editTestId);
  if (!q || !t) return;

  const txt = $('q-text')?.value.trim();
  if (!txt) { toast('Question text is required','error'); return; }
  q.text = txt;
  q.marks = parseFloat($('q-marks')?.value) || 0;
  q.negMarks = parseFloat($('q-neg')?.value) || 0;
  q.solution = $('q-sol')?.value.trim() || '';

  if (q.type.startsWith('mcq')) {
    q.options.forEach(o=>{
      const el = document.querySelector(`#oei-${o.id} input[type=text]`);
      if (el) o.text = el.value.trim();
    });
    if (q.options.some(o=>!o.text)) { toast('All options need text','error'); return; }
    if (!q.correct.length) { toast('Mark at least one correct answer','error'); return; }
  } else {
    const ma = $('q-model-ans')?.value.trim();
    q.correct = ma ? [ma] : [];
  }

  const { _isNew, ...qdata } = q;
  if (_isNew) t.questions.push(qdata);
  else {
    const idx = t.questions.findIndex(x=>x.id===q.id);
    if (idx >= 0) t.questions[idx] = qdata;
  }

  await DB.saveTest(t);
  closeQModal();
  $('q-list').innerHTML = renderQList(t);
  toast('Question saved!','success');
}

function closeQModal() {
  const m = $('q-modal');
  if (m) m.remove();
  A.editQ = null;
}

// ═══════════════════════════════════════════════════════
// RESULTS PER TEST
// ═══════════════════════════════════════════════════════
async function openResults(id) {
  A.resultTestId = id;
  A.view = 'results';

  const content = $('admin-content');
  content.innerHTML = '<div style="padding:100px;text-align:center"><div class="spinner"></div></div>';

  const t = await DB.getAdminTest(id);
  const subsRes = await DB.getAdminSubmissions();
  const allSubs = subsRes.submissions || [];
  const subs = allSubs.filter(s => s.testId === id);

  const maxMarks = (t.questions||[]).reduce((sum,q)=>sum + (q.marks||0), 0);
  const avg = subs.length ? (subs.reduce((sum,x)=>sum + x.score, 0)/subs.length).toFixed(1) : '—';

  content.innerHTML = `
    <div class="flex-between" style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px">
        <button class="btn btn-ghost btn-sm" onclick="renderDashboard()">← Back</button>
        <h1 style="font-size:19px;font-weight:700">Results: ${esc(t.title)}</h1>
      </div>
    </div>

    <div class="g2" style="max-width:500px;margin-bottom:22px">
      <div class="mark-box"><label>Submissions</label><input value="${subs.length}" readonly style="color:var(--blue)"></div>
      <div class="mark-box"><label>Average Score</label><input value="${avg}/${maxMarks}" readonly style="color:var(--accent)"></div>
    </div>

    <div class="sec-box">
      <div class="sec-hdr">Submissions</div>
      ${!subs.length
        ? `<div class="empty"><div class="empty-icon">📭</div><h3>No submissions</h3><p>Students haven't taken this test yet</p></div>`
        : `<div class="results-table-wrap">
            <table>
              <thead><tr>
                <th>Name</th><th>Roll No</th><th>Score</th><th>%</th>
                <th>Correct</th><th>Wrong</th><th>Skipped</th><th>Date</th><th>Action</th>
              </tr></thead>
              <tbody>
                ${subs.sort((a,b)=>b.score-a.score).map(s=>{
                  const pct = maxMarks ? Math.round((Math.max(0,s.score)/maxMarks)*100) : 0;
                  return `<tr>
                    <td style="font-weight:500">${esc(s.studentName)}</td>
                    <td style="font-family:var(--mono);font-size:12px">${esc(s.rollNo)}</td>
                    <td style="font-weight:700;color:${pct>=50?'var(--green)':'var(--red)'}">${s.score.toFixed(1)}/${maxMarks}</td>
                    <td>${pct}%</td>
                    <td style="color:var(--green)">${s.correct}</td>
                    <td style="color:var(--red)">${s.incorrect}</td>
                    <td style="color:var(--text-muted)">${s.unanswered}</td>
                    <td style="color:var(--text-muted)">${new Date(s.timestamp).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</td>
                    <td><button class="btn btn-ghost btn-sm" onclick="window.viewSubmission('${s.id}')">View</button></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`}
    </div>`;
}

// Modal for per-test submissions
window.viewSubmission = async (subId) => {
  const t = await DB.getAdminTest(A.resultTestId);
  const subsRes = await DB.getAdminSubmissions();
  const sub = (subsRes.submissions||[]).find(s=>s.id===subId);
  if (!t || !sub) return;

  let modal = $('sub-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'sub-modal';
    modal.className = 'overlay';
    document.body.appendChild(modal);
  }

  const detailsHTML = (t.questions||[]).map((q,i)=>{
    const ya = (sub.answers||{})[q.id];
    const isAns = ya !== undefined && ya !== null && ya !== '' && !(Array.isArray(ya) && ya.length===0);

    let ok = false;
    if (q.type==='mcq-single') ok = ya === q.correct[0];
    else if (q.type==='mcq-multi') ok = isAns && [...ya].sort().join(',') === [...q.correct].sort().join(',');
    else ok = isAns && String(ya).trim().toLowerCase() === String(q.correct[0]||'').trim().toLowerCase();

    const status = !isAns ? `<span class="badge b-gray">Skipped</span>` : ok ? `<span class="badge b-green">✓ Correct</span>` : `<span class="badge b-red">✗ Wrong</span>`;

    let fmtAns = '<em style="color:var(--text-dim)">Not answered</em>';
    if (isAns) {
      if (Array.isArray(ya)) {
        fmtAns = ya.map(id => q.options.find(o=>o.id===id)?.text || id).map(parseMD).join(', ');
      } else if (q.type.startsWith('mcq')) {
        const o = q.options.find(o=>o.id===ya);
        fmtAns = o ? parseMD(o.text) : esc(ya);
      } else {
        fmtAns = esc(ya);
      }
    }

    const correctFmt = q.type==='mcq-multi'
      ? q.correct.map(id=>q.options.find(o=>o.id===id)?.text||id).map(parseMD).join(', ')
      : q.type==='mcq-single'
        ? parseMD(q.options.find(o=>o.id===q.correct[0])?.text || q.correct[0])
        : esc(q.correct[0] || '—');

    return `
      <div style="background:var(--bg); border:1px solid var(--border); padding:10px; border-radius:6px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px">
          <span style="font-weight:600;font-size:13px;color:var(--text-muted)">Q${i+1}. ${QTYPES[q.type]||q.type}</span>
          ${status}
        </div>
        <div style="font-size:14px; margin-bottom:10px">${parseMD(q.text)}</div>
        <div style="display:flex; gap:10px; flex-wrap:wrap">
          <div style="flex:1; min-width:200px; padding:8px; background:${isAns?(ok?'rgba(0,255,100,0.05)':'rgba(255,0,0,0.05)'):'var(--bg-card)'}; border-radius:4px; border:1px solid ${isAns?(ok?'var(--green)':'var(--red)'):'var(--border)'}">
            <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px">Student's Answer</div>
            <div style="font-size:13px">${fmtAns}</div>
          </div>
          <div style="flex:1; min-width:200px; padding:8px; background:rgba(0,255,100,0.05); border-radius:4px; border:1px dashed var(--green)">
            <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px">Correct Answer</div>
            <div style="font-size:13px">${correctFmt}</div>
          </div>
        </div>
        ${q.solution ? `<div style="margin-top:10px;font-size:13px;color:var(--text-muted)">💡 Solution: ${parseMD(q.solution)}</div>` : ''}
      </div>`;
  }).join('');

  modal.innerHTML = `
    <div class="modal" style="max-width:800px; width:100%; max-height:90vh; display:flex; flex-direction:column;">
      <div class="modal-head">
        <div>
          <h3>${esc(sub.studentName)} (${esc(sub.rollNo)})</h3>
          <div style="font-size:13px; color:var(--text-muted); margin-top:4px">Score: ${sub.score} | Test: ${esc(t.title)}</div>
        </div>
        <button class="btn-icon" onclick="document.getElementById('sub-modal').remove()">✕</button>
      </div>
      <div style="flex:1; overflow-y:auto; padding-top:10px">
        ${detailsHTML}
      </div>
    </div>`;
};

// ═══════════════════════════════════════════════════════
// ALL SUBMISSIONS
// ═══════════════════════════════════════════════════════
async function openAllSubmissions() {
  A.view = 'all-subs';
  const content = $('admin-content');
  content.innerHTML = '<div style="padding:100px;text-align:center"><div class="spinner"></div></div>';

  const subsRes = await DB.getAdminSubmissions();
  const allSubs = subsRes.submissions || [];
  const tests = await DB.getAdminTests();

  const testMap = {};
  (tests||[]).forEach(t=>{ testMap[t.id] = t; });

  content.innerHTML = `
    <div class="flex-between" style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px">
        <button class="btn btn-ghost btn-sm" onclick="renderDashboard()">← Back</button>
        <h1 style="font-size:19px;font-weight:700">All Submissions</h1>
      </div>
    </div>

    <div class="sec-box">
      <div class="sec-hdr">Submissions</div>
      ${!allSubs.length
        ? `<div class="empty"><div class="empty-icon">📭</div><h3>No submissions yet</h3><p>Students have not taken any tests</p></div>`
        : `<div class="results-table-wrap">
            <table>
              <thead><tr>
                <th>Name</th><th>Roll No</th><th>Test</th><th>Score</th><th>Correct</th><th>Wrong</th><th>Skipped</th><th>Date</th><th>Action</th>
              </tr></thead>
              <tbody>
                ${allSubs.sort((a,b)=>b.timestamp-a.timestamp).map(s=>{
                  const t = testMap[s.testId];
                  const maxMarks = t ? (t.questions||[]).reduce((sum,q)=>sum+(q.marks||0),0) : 0;
                  const pct = maxMarks ? Math.round((Math.max(0,s.score)/maxMarks)*100) : 0;
                  return `<tr>
                    <td style="font-weight:500">${esc(s.studentName)}</td>
                    <td style="font-family:var(--mono);font-size:12px">${esc(s.rollNo)}</td>
                    <td>${esc(t?.title || s.testId)}</td>
                    <td style="font-weight:700;color:${pct>=50?'var(--green)':'var(--red)'}">${s.score.toFixed(1)}/${maxMarks}</td>
                    <td style="color:var(--green)">${s.correct}</td>
                    <td style="color:var(--red)">${s.incorrect}</td>
                    <td style="color:var(--text-muted)">${s.unanswered}</td>
                    <td style="color:var(--text-muted);white-space:nowrap">${new Date(s.timestamp).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</td>
                    <td><button class="btn btn-ghost btn-sm" onclick="window.viewAnySubmission('${s.id}','${s.testId}')">View</button></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`}
    </div>`;
}

window.viewAnySubmission = async (subId, testId) => {
  const t = await DB.getAdminTest(testId);
  const subsRes = await DB.getAdminSubmissions();
  const sub = (subsRes.submissions||[]).find(s=>s.id===subId);
  if (!t || !sub) return;

  let modal = $('sub-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'sub-modal';
    modal.className = 'overlay';
    document.body.appendChild(modal);
  }

  // Reuse logic from viewSubmission
  const detailsHTML = (t.questions||[]).map((q,i)=>{
    const ya = (sub.answers||{})[q.id];
    const isAns = ya !== undefined && ya !== null && ya !== '' && !(Array.isArray(ya) && ya.length===0);

    let ok = false;
    if (q.type==='mcq-single') ok = ya === q.correct[0];
    else if (q.type==='mcq-multi') ok = isAns && [...ya].sort().join(',') === [...q.correct].sort().join(',');
    else ok = isAns && String(ya).trim().toLowerCase() === String(q.correct[0]||'').trim().toLowerCase();

    const status = !isAns ? `<span class="badge b-gray">Skipped</span>` : ok ? `<span class="badge b-green">✓ Correct</span>` : `<span class="badge b-red">✗ Wrong</span>`;

    let fmtAns = '<em style="color:var(--text-dim)">Not answered</em>';
    if (isAns) {
      if (Array.isArray(ya)) fmtAns = ya.map(id=>q.options.find(o=>o.id===id)?.text || id).map(parseMD).join(', ');
      else if (q.type.startsWith('mcq')) fmtAns = parseMD(q.options.find(o=>o.id===ya)?.text || ya);
      else fmtAns = esc(ya);
    }

    const correctFmt = q.type==='mcq-multi'
      ? q.correct.map(id=>q.options.find(o=>o.id===id)?.text||id).map(parseMD).join(', ')
      : q.type==='mcq-single'
        ? parseMD(q.options.find(o=>o.id===q.correct[0])?.text || q.correct[0])
        : esc(q.correct[0] || '—');

    return `
      <div style="background:var(--bg); border:1px solid var(--border); padding:10px; border-radius:6px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px">
          <span style="font-weight:600;font-size:13px;color:var(--text-muted)">Q${i+1}. ${QTYPES[q.type]||q.type}</span>
          ${status}
        </div>
        <div style="font-size:14px; margin-bottom:10px">${parseMD(q.text)}</div>
        <div style="display:flex; gap:10px; flex-wrap:wrap">
          <div style="flex:1; min-width:200px; padding:8px; background:${isAns?(ok?'rgba(0,255,100,0.05)':'rgba(255,0,0,0.05)'):'var(--bg-card)'}; border-radius:4px; border:1px solid ${isAns?(ok?'var(--green)':'var(--red)'):'var(--border)'}">
            <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px">Student's Answer</div>
            <div style="font-size:13px">${fmtAns}</div>
          </div>
          <div style="flex:1; min-width:200px; padding:8px; background:rgba(0,255,100,0.05); border-radius:4px; border:1px dashed var(--green)">
            <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px">Correct Answer</div>
            <div style="font-size:13px">${correctFmt}</div>
          </div>
        </div>
        ${q.solution ? `<div style="margin-top:10px;font-size:13px;color:var(--text-muted)">💡 Solution: ${parseMD(q.solution)}</div>` : ''}
      </div>`;
  }).join('');

  modal.innerHTML = `
    <div class="modal" style="max-width:800px; width:100%; max-height:90vh; display:flex; flex-direction:column;">
      <div class="modal-head">
        <div>
          <h3>${esc(sub.studentName)} (${esc(sub.rollNo)})</h3>
          <div style="font-size:13px; color:var(--text-muted); margin-top:4px">Score: ${sub.score} | Test: ${esc(t.title)}</div>
        </div>
        <button class="btn-icon" onclick="document.getElementById('sub-modal').remove()">✕</button>
      </div>
      <div style="flex:1; overflow-y:auto; padding-top:10px">
        ${detailsHTML}
      </div>
    </div>`;
};

// ═══════════════════════════════════════════════════════
// BOOTSTRAP
// ═══════════════════════════════════════════════════════
window.doLogin = doLogin;
window.doLogout = doLogout;
window.createTest = createTest;
window.openTestEditor = openTestEditor;
window.saveTestMeta = saveTestMeta;
window.deleteTest = deleteTest;
window.toggleActive = toggleActive;
window.openQEditor = openQEditor;
window.saveQ = saveQ;
window.closeQModal = closeQModal;
window.deleteQ = deleteQ;
window.openResults = openResults;
window.renderDashboard = renderDashboard;
window.openAllSubmissions = openAllSubmissions;

window.addEventListener('DOMContentLoaded', init);


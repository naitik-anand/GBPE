/**
 * QuizForge — Test Page Script (test.js)
 *
 * KEY FIX: Text answer (short/long) inputs do NOT trigger any re-render.
 * Only question navigation triggers DOM updates. This fixes the typing bug.
 */

// ── State ─────────────────────────────────────────────
const S = {
  test:        null,
  student:     null,
  answers:     {},        // { [questionId]: value }
  reviewed:    new Set(), // question IDs marked for review
  curIdx:      0,
  timeLeft:    0,
  timerInt:    null,
  submitted:   false,
  // Proctoring
  fsWarn:      false,
  fsCD:        10,
  fsCDInt:     null,
  tabViolations: 0,
  procActive:  false,
  _lastFSChange: 0,
  _lastBlur:   0,
};

// ── Helpers ───────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => !s ? '' : String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const pad = n => String(n).padStart(2,'0');
const LETTERS = ['A','B','C','D','E','F'];
const QTYPES = {'mcq-single':'MCQ Single','mcq-multi':'Multi-Select','short':'Short Answer','long':'Long Answer'};
const isAns = a => DB.isAnswered(a);

function toast(msg, type='info') {
  const w = $('toast-wrap');
  if (!w) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  w.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function getQState(idx) {
  const q = S.test.questions[idx];
  const ans = S.answers[q.id];
  const rev = S.reviewed.has(q.id);
  const answered = isAns(ans);
  if (answered && rev)  return 'pn-ans-review';
  if (answered)         return 'pn-answered';
  if (rev)              return 'pn-review';
  // Determine if visited — we track by checking if they ever changed the index
  return 'pn-notvisited';
}

// ── Markdown Parser ───────────────────────────────────
function parseMD(str) {
  if (!str) return '';
  let html = esc(str);
  // Parse images: ![alt](url)
  html = html.replace(/!\[([^\]]+)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:4px;margin:8px 0;max-height:300px;object-fit:contain;display:block">');
  // Parse links: [name](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--blue);text-decoration:underline">$1</a>');
  return html;
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
async function init() {
  // Check session
  S.student = DB.getSession ? DB.getSession() : null;
  if (!S.student) { window.location.href = 'index.html'; return; }

  // Get test ID from URL
  const params = new URLSearchParams(window.location.search);
  const testId = params.get('id');
  if (!testId) { window.location.href = 'index.html'; return; }

  try {
    S.test = await DB.getTest(testId);
  } catch(e) {
    alert('Failed to connect to server.'); window.location.href = 'index.html'; return;
  }
  
  if (!S.test || !S.test.active || !S.test.questions.length) {
    alert('This test is not available.'); window.location.href = 'index.html'; return;
  }

  // Hide loading, show splash
  $('test-loading').style.display = 'none';
  const fsStart = $('fs-start');
  if (fsStart) fsStart.style.display = 'flex';
}

function initFullscreenAndStart() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
  if (fn) {
    try {
      const p = fn.call(el);
      if (p && p.then) {
        p.then(startTestFlow).catch(() => startTestFlow());
      } else {
        startTestFlow();
      }
    } catch (e) {
      startTestFlow();
    }
  } else {
    startTestFlow(); // iOS/unsupported fallback
  }
}

function startTestFlow() {
  $('fs-start').style.display = 'none';
  $('test-shell').style.display = 'flex';

  // Fill header
  $('th-title').textContent   = S.test.title;
  $('th-sname').textContent   = S.student.name;
  $('th-sroll').textContent   = S.student.rollNo;

  // Init
  S.timeLeft = S.test.duration * 60;
  S.answers = {};
  renderQuestion(0);
  updatePalette();
  updateSectionBar();
  startTimer();
  setupProctoring();
}

// ═══════════════════════════════════════════════════════
//  QUESTION RENDERING
//  !! IMPORTANT: no re-render during text input !!
// ═══════════════════════════════════════════════════════
function renderQuestion(idx) {
  S.curIdx = idx;
  const q = S.test.questions[idx];

  // Meta
  $('q-num-label').textContent  = `Q ${idx + 1} / ${S.test.questions.length}`;
  $('q-type-label').textContent = QTYPES[q.type] || q.type;
  $('q-marks-info').innerHTML   =
    `<span style="color:var(--green)">+${q.marks}</span>&nbsp;&nbsp;` +
    (q.negMarks > 0 ? `<span style="color:var(--red)">−${q.negMarks} neg</span>` : `<span style="color:var(--text-muted)">No neg marking</span>`);

  // Question text
  $('q-text').innerHTML = parseMD(q.text);

  // Answer area
  const ac = $('answer-container');
  ac.innerHTML = '';

  if (q.type === 'mcq-single' || q.type === 'mcq-multi') {
    renderMCQ(q, ac);
  } else {
    renderTextAnswer(q, ac);
  }

  // Mark-for-review button state
  const rvBtn = $('btn-review');
  if (rvBtn) {
    rvBtn.classList.toggle('active', S.reviewed.has(q.id));
    rvBtn.textContent = S.reviewed.has(q.id) ? '🔖 Marked' : '🔖 Mark for Review';
  }

  // Nav buttons
  $('btn-prev').disabled = idx === 0;
  $('btn-next').style.display    = idx < S.test.questions.length - 1 ? 'inline-flex' : 'none';
  $('btn-submit').style.display  = idx === S.test.questions.length - 1 ? 'inline-flex' : 'none';

  updatePalette();
}

// ── MCQ ───────────────────────────────────────────────
function renderMCQ(q, container) {
  const isMulti = q.type === 'mcq-multi';
  const sel = isMulti ? (S.answers[q.id] || []) : S.answers[q.id];

  const wrap = document.createElement('div');
  wrap.className = 'options-wrap';
  if (isMulti) {
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:12px;color:var(--text-muted);margin-bottom:6px';
    hint.textContent = 'Select all correct options';
    wrap.appendChild(hint);
  }

  q.options.forEach((opt, i) => {
    const isSelected = isMulti ? sel.includes(opt.id) : sel === opt.id;
    const div = document.createElement('div');
    div.className = `opt${isSelected ? ' selected' : ''}`;
    div.innerHTML = `
      <div class="opt-key">${isSelected ? '✓' : LETTERS[i]}</div>
      <div class="opt-text">${parseMD(opt.text)}</div>`;
    div.addEventListener('click', () => selectMCQ(q, opt.id, isMulti));
    wrap.appendChild(div);
  });

  // Clear button for single
  if (!isMulti && isAns(sel)) {
    const clr = document.createElement('button');
    clr.className = 'clear-btn'; clr.textContent = '✕ Clear Selection';
    clr.addEventListener('click', () => { delete S.answers[q.id]; renderQuestion(S.curIdx); });
    wrap.appendChild(clr);
  }

  container.appendChild(wrap);
}

function selectMCQ(q, optId, isMulti) {
  if (isMulti) {
    const cur = S.answers[q.id] || [];
    S.answers[q.id] = cur.includes(optId) ? cur.filter(v=>v!==optId) : [...cur, optId];
  } else {
    S.answers[q.id] = optId;
  }
  // For MCQ: re-render just the answer area (not the whole page)
  renderQuestion(S.curIdx);
}

// ── Text Answer (SHORT FIX) ───────────────────────────
function renderTextAnswer(q, container) {
  const wrap = document.createElement('div');
  wrap.className = 'text-answer-wrap';

  const label = document.createElement('label');
  label.textContent = q.type === 'short'
    ? '✏️ Type your answer (short)'
    : '✏️ Write your detailed answer';

  // !! THE FIX: Create textarea ONCE. Only update state on input, NO re-render. !!
  const ta = document.createElement('textarea');
  ta.id            = 'answer-textarea';
  ta.rows          = q.type === 'long' ? 10 : 4;
  ta.placeholder   = q.type === 'short'
    ? 'Type your answer here...'
    : 'Write your detailed answer here...';
  ta.value         = S.answers[q.id] || '';  // restore saved value
  ta.style.minHeight = q.type === 'long' ? '200px' : '100px';

  // !! CRITICAL: oninput ONLY updates state. No DOM changes, no re-render. !!
  ta.addEventListener('input', (e) => {
    S.answers[q.id] = e.target.value;
    // Update palette dot silently (no full re-render)
    updatePaletteCell(S.curIdx);
  });

  const clearBtn = document.createElement('button');
  clearBtn.className = 'clear-btn';
  clearBtn.type = 'button';
  clearBtn.textContent = '✕ Clear';
  clearBtn.addEventListener('click', () => {
    S.answers[q.id] = '';
    ta.value = '';
    ta.focus();
    updatePaletteCell(S.curIdx);
  });

  wrap.appendChild(label);
  wrap.appendChild(ta);
  wrap.appendChild(clearBtn);
  container.appendChild(wrap);

  // Auto-focus for immediate typing
  requestAnimationFrame(() => ta.focus());
}

// ═══════════════════════════════════════════════════════
//  PALETTE
// ═══════════════════════════════════════════════════════
function updatePalette() {
  const grid = $('palette-grid');
  if (!grid) return;
  grid.innerHTML = S.test.questions.map((q, i) => {
    const ans = S.answers[q.id];
    const rev = S.reviewed.has(q.id);
    const answered = isAns(ans);
    let cls = 'pn-notvisited';
    if (answered && rev) cls = 'pn-ans-review';
    else if (answered)   cls = 'pn-answered';
    else if (rev)        cls = 'pn-review';
    const cur = i === S.curIdx ? ' current' : '';
    return `<button class="pn ${cls}${cur}" onclick="goToQ(${i})" title="Q${i+1}">${i+1}</button>`;
  }).join('');

  // Update counts
  const answered = S.test.questions.filter(q => isAns(S.answers[q.id])).length;
  const pal = $('palette-count');
  if (pal) pal.textContent = `${answered}/${S.test.questions.length}`;
}

function updatePaletteCell(idx) {
  const q   = S.test.questions[idx];
  const ans = S.answers[q.id];
  const rev = S.reviewed.has(q.id);
  const answered = isAns(ans);
  let cls = 'pn-notvisited';
  if (answered && rev) cls = 'pn-ans-review';
  else if (answered)   cls = 'pn-answered';
  else if (rev)        cls = 'pn-review';

  const cells = document.querySelectorAll('.pn');
  const cell  = cells[idx];
  if (cell) {
    cell.className = `pn ${cls}${idx === S.curIdx ? ' current' : ''}`;
  }

  // Update answered count
  const answered2 = S.test.questions.filter(q => isAns(S.answers[q.id])).length;
  const pal = $('palette-count');
  if (pal) pal.textContent = `${answered2}/${S.test.questions.length}`;
}

function updateSectionBar() {
  const sb = $('section-bar-info');
  if (sb) sb.textContent = S.test.title;
}

// ═══════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════
function goToQ(idx) {
  if (idx < 0 || idx >= S.test.questions.length) return;
  renderQuestion(idx);
}
function prevQ() { goToQ(S.curIdx - 1); }
function nextQ() { goToQ(S.curIdx + 1); }
function toggleReview() {
  const q = S.test.questions[S.curIdx];
  if (S.reviewed.has(q.id)) S.reviewed.delete(q.id);
  else                       S.reviewed.add(q.id);
  renderQuestion(S.curIdx); // update button state
}

// ═══════════════════════════════════════════════════════
//  TIMER
// ═══════════════════════════════════════════════════════
function startTimer() {
  clearInterval(S.timerInt);
  updateTimerDisplay();
  S.timerInt = setInterval(() => {
    if (S.submitted) { clearInterval(S.timerInt); return; }
    S.timeLeft--;
    updateTimerDisplay();
    if (S.timeLeft <= 0) {
      clearInterval(S.timerInt);
      alert('⏱ Time is up! Your test will be submitted.');
      submitTest(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = $('timer-val');
  if (!el) return;
  const m = Math.floor(S.timeLeft / 60), s = S.timeLeft % 60;
  el.textContent = `${pad(m)}:${pad(s)}`;
  el.className = `timer-val${S.timeLeft < 300 ? ' warn' : ''}`;
}

// ═══════════════════════════════════════════════════════
//  SUBMISSION
// ═══════════════════════════════════════════════════════
function confirmSubmit() {
  const unanswered = S.test.questions.filter(q => !isAns(S.answers[q.id])).length;
  if (unanswered > 0) {
    if (!confirm(`⚠️ ${unanswered} question(s) unanswered.\nSubmit anyway?`)) return;
  } else {
    if (!confirm('Submit your test? This cannot be undone.')) return;
  }
  submitTest(false);
}

async function submitTest(forced) {
  if (S.submitted) return;
  S.submitted = true;
  clearInterval(S.timerInt);
  teardownProctoring();

  // Exit fullscreen
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch(e) {}
  
  $('test-shell').style.display = 'none';
  const rs = $('results-screen');
  rs.innerHTML = '<div style="margin:60px auto;text-align:center"><div class="spinner" style="margin:0 auto 15px"></div><p style="color:var(--text-muted)">Submitting to server...</p></div>';
  rs.style.display = 'block';

  try {
    const result = await DB.submitTest(S.test.id, S.student.rollNo, S.student.name, S.answers);
    if (result.error) {
      rs.innerHTML = `<div class="empty"><h3>Submission Error</h3><p>${result.error}</p><a href="index.html" class="btn btn-primary">Return Home</a></div>`;
      return;
    }
    
    // Result object has score, maxScore, correct, incorrect, unanswered
    const sub = {
      testId: S.test.id,
      rollNo: S.student.rollNo,
      studentName: S.student.name,
      ...result
    };
    showResults(sub);

  } catch(e) {
    rs.innerHTML = `<div class="empty"><h3>Connection Error</h3><p>Could not reach the server.</p><a href="index.html" class="btn btn-primary">Return Home</a></div>`;
  }
}

// ═══════════════════════════════════════════════════════
//  RESULTS
// ═══════════════════════════════════════════════════════
function showResults(sub) {
  // Hide test shell, show results
  $('test-shell').style.display   = 'none';
  $('results-screen').style.display = 'block';
  $('results-screen').classList.add('show');

  const pct = Math.round((Math.max(0, sub.score) / sub.maxScore) * 100);
  const msg = pct >= 75 ? '🎉 Excellent performance!' : pct >= 50 ? '👍 Good attempt!' : '📚 Keep practicing!';

  $('results-screen').innerHTML = `
    <div class="score-card">
      <h2 style="margin-bottom:4px">${esc(S.test.title)}</h2>
      <p style="color:var(--text-muted);margin-bottom:26px">Submitted by <strong>${esc(sub.studentName)}</strong> — Roll: <span style="font-family:var(--mono)">${esc(sub.rollNo)}</span></p>
      <div class="score-ring" style="--pct:${pct}">
        <svg viewBox="0 0 120 120" width="120" height="120">
          <circle class="circle-bg"   cx="60" cy="60" r="54"/>
          <circle class="circle-fill" cx="60" cy="60" r="54"/>
        </svg>
        <div class="score-big">${sub.score.toFixed(1)}</div>
        <div class="score-of">/ ${sub.maxScore}</div>
      </div>
      <div class="score-pct">${pct}%</div>
      <div class="score-msg">${msg}</div>
      <div class="stat-boxes">
        <div class="stat-box"><div class="stat-n" style="color:var(--green)">${sub.correct}</div><div class="stat-l">Correct</div></div>
        <div class="stat-box"><div class="stat-n" style="color:var(--red)">${sub.incorrect}</div><div class="stat-l">Incorrect</div></div>
        <div class="stat-box"><div class="stat-n" style="color:var(--text-muted)">${sub.unanswered}</div><div class="stat-l">Skipped</div></div>
      </div>
    </div>

    </div>

    <div style="text-align:center;margin:20px 0 28px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
      <a href="index.html" class="btn btn-ghost">← Back to Tests</a>
      ${S.test.has_pdf ? `<button class="btn btn-outline btn-lg" onclick="downloadTestPDF()">📄 Download Question PDF</button>` : ''}
      <button class="btn btn-primary btn-lg" id="btn-view-sol" onclick="showSolutions()">📖 View Solutions</button>
    </div>

    <div id="sol-section" style="display:none">
      <div class="sec-hdr">Solutions &amp; Answers</div>
      <div class="sol-list" id="sol-list">
        <div style="text-align:center;padding:30px"><div class="spinner" style="margin:0 auto"></div></div>
      </div>
    </div>`;
}

async function showSolutions() {
  const solSec = $('sol-section');
  const solList = $('sol-list');
  const btn = $('btn-view-sol');
  if (!solSec || !solList) return;
  solSec.style.display = 'block';
  solSec.scrollIntoView({ behavior:'smooth' });
  
  if (btn) btn.disabled = true;

  try {
    const res = await DB.getSolutions(S.test.id, S.student.rollNo);
    if (res.error) throw new Error(res.error);
    
    // Store full questions from backend
    S.test.questions = res.questions;
    // Store PDF if provided from backend just in case
    if (res.pdf_data) S.test._pdfData = res.pdf_data;
    
  } catch(e) {
    solList.innerHTML = `<div style="text-align:center;color:var(--red);padding:20px">Failed to load solutions.</div>`;
    if (btn) btn.disabled = false;
    return;
  }
  
  // Re-enable button
  if (btn) btn.disabled = false;

  solList.innerHTML = S.test.questions.map((q, i) => {
    const ya  = S.answers[q.id];
    const ha  = isAns(ya);
    let ok = false;
    if (q.type === 'mcq-single')  ok = ya === q.correct[0];
    else if (q.type === 'mcq-multi') ok = ha && [...ya].sort().join(',') === [...q.correct].sort().join(',');
    else ok = ha && ya.trim().toLowerCase() === (q.correct[0]||'').trim().toLowerCase();

    const status = !ha ? `<span class="badge b-gray">Skipped</span>`
                 : ok  ? `<span class="badge b-green">✓ Correct</span>`
                       : `<span class="badge b-red">✗ Wrong</span>`;
    const earned = !ha ? -(S.test.marking.unanswered||0)
                 : ok  ?  q.marks : -(q.negMarks||0);

    const fmtAns = (a) => {
      if (!isAns(a)) return '<em style="color:var(--text-dim)">Not answered</em>';
      if (Array.isArray(a)) return a.map(id => q.options.find(o=>o.id===id)?.text || id).map(parseMD).join(', ');
      if (q.type.startsWith('mcq')) { const o = q.options.find(o=>o.id===a); return o?parseMD(o.text):esc(a); }
      return esc(a);
    };

    const correctFmt = q.type === 'mcq-multi'
      ? q.correct.map(id => q.options.find(o=>o.id===id)?.text||id).map(parseMD).join(', ')
      : q.type === 'mcq-single' ? parseMD(q.options.find(o=>o.id===q.correct[0])?.text || q.correct[0])
      : esc(q.correct[0] || '—');

    return `
      <div class="sol-item">
        <div class="sol-header">
          <span style="font-family:var(--mono);font-size:11px;color:var(--text-muted)">Q${i+1}</span>
          ${status}
          <span style="margin-left:auto;font-family:var(--mono);font-size:13px;font-weight:600;color:${earned>0?'var(--green)':earned<0?'var(--red)':'var(--text-muted)'}">${earned>0?'+':''}${earned}</span>
        </div>
        <div class="sol-q">${parseMD(q.text)}</div>
        <div class="ans-compare">
          <div class="ans-box ${!ha?'':ok?'correct-ans':'wrong-ans'}">
            <label>Your Answer</label>
            <div class="ans-val">${fmtAns(ya)}</div>
          </div>
          <div class="ans-box correct-ans">
            <label>Correct Answer</label>
            <div class="ans-val">${correctFmt}</div>
          </div>
        </div>
        ${q.solution ? `<div class="sol-explanation">💡 ${parseMD(q.solution)}</div>` : ''}
      </div>`;
  }).join('');
}

async function downloadTestPDF() {
  let pdf = S.test._pdfData;
  if (!pdf) {
    try {
      const btn = document.querySelector('button[onclick="downloadTestPDF()"]');
      if (btn) btn.textContent = "Downloading...";
      const res = await DB.getSolutions(S.test.id, S.student.rollNo);
      if (res.pdf_data) {
        pdf = res.pdf_data;
        S.test._pdfData = pdf;
      }
      if (btn) btn.textContent = "📄 Download Question PDF";
    } catch(e) {}
  }
  
  if (!pdf) { toast('PDF not available', 'error'); return; }
  
  // Base64 to Blob
  try {
    const base64str = pdf.includes(',') ? pdf.split(',')[1] : pdf;
    const binStr = atob(base64str);
    const len = binStr.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) { arr[i] = binStr.charCodeAt(i); }
    const blob = new Blob([arr], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${S.test.title} - Questions.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch(e) {
    toast('Error parsing PDF', 'error');
  }
}

// ═══════════════════════════════════════════════════════
//  PROCTORING
// ═══════════════════════════════════════════════════════
function requestFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
  if (fn) fn.call(el).catch(() => {});
}

function setupProctoring() {
  if (S.procActive) return;
  S.procActive = true;
  document.addEventListener('fullscreenchange',       onFSChange);
  document.addEventListener('webkitfullscreenchange', onFSChange);
  document.addEventListener('visibilitychange',       onVisibilityChange);
  window.addEventListener('blur',                     onWindowBlur);
  document.addEventListener('contextmenu',            blockCtx);
  document.addEventListener('keydown',                blockKeys);
}

function teardownProctoring() {
  if (!S.procActive) return;
  S.procActive = false;
  document.removeEventListener('fullscreenchange',       onFSChange);
  document.removeEventListener('webkitfullscreenchange', onFSChange);
  document.removeEventListener('visibilitychange',       onVisibilityChange);
  window.removeEventListener('blur',                     onWindowBlur);
  document.removeEventListener('contextmenu',            blockCtx);
  document.removeEventListener('keydown',                blockKeys);
}

function onFSChange() {
  if (S.submitted) return;
  const now = Date.now();
  if (now - S._lastFSChange < 600) { S._lastFSChange = now; return; }
  S._lastFSChange = now;
  const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (!isFS) startFSCountdown();
  else       cancelFSCountdown();
}

function startFSCountdown() {
  if (S.fsWarn) return;
  S.fsWarn = true; S.fsCD = 10;
  const ov = $('fs-overlay');
  if (!ov) return;
  ov.style.display = 'flex';
  $('fs-count').textContent = S.fsCD;
  S.fsCDInt = setInterval(() => {
    S.fsCD--;
    const el = $('fs-count'); if (el) el.textContent = S.fsCD;
    if (S.fsCD <= 0) { clearInterval(S.fsCDInt); forceSubmit('Fullscreen exited'); }
  }, 1000);
}

function cancelFSCountdown() {
  if (!S.fsWarn) return;
  clearInterval(S.fsCDInt);
  S.fsWarn = false;
  const ov = $('fs-overlay');
  if (ov) ov.style.display = 'none';
}

function reEnterFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fn) {
    try {
      const p = fn.call(el);
      if (p && p.then) {
        p.then(() => cancelFSCountdown()).catch(() => {});
      } else {
        cancelFSCountdown();
      }
    } catch (e) {
      cancelFSCountdown();
    }
  }
}

function onWindowBlur() {
  if (S.submitted || S.fsWarn) return;
  const now = Date.now();
  if (now - S._lastBlur < 800) { S._lastBlur = now; return; }
  S._lastBlur = now;
  recordViolation();
}

function onVisibilityChange() {
  if (S.submitted || S.fsWarn) return;
  if (document.hidden) recordViolation();
}

function recordViolation() {
  S.tabViolations++;
  showTabWarning(S.tabViolations);
  if (S.tabViolations >= 3) {
    setTimeout(() => forceSubmit('Too many tab/window switches (3 violations)'), 1200);
  }
}

function showTabWarning(n) {
  const tw = $('tab-warn');
  if (!tw) return;
  tw.innerHTML = `<h4>⚠️ Focus Lost — Warning ${n}/3</h4>
    <p>${n >= 3 ? 'Auto-submitting now...' : 'Do not switch tabs or windows. ' + (3-n) + ' warning(s) left.'}</p>`;
  tw.style.display = 'block';
  clearTimeout(tw._t);
  tw._t = setTimeout(() => { tw.style.display = 'none'; }, 4000);
}

function forceSubmit(reason) {
  clearInterval(S.fsCDInt);
  const ov = $('fs-overlay'); if (ov) ov.style.display = 'none';
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch(e) {}
  alert(`⚠️ Auto-submit: ${reason}`);
  submitTest(true);
}

function blockCtx(e) { if (!S.submitted) e.preventDefault(); }
function blockKeys(e) {
  if (S.submitted) return;
  if ((e.altKey  && e.key === 'Tab'))               e.preventDefault();
  if ((e.ctrlKey && ['Tab','w','W'].includes(e.key))) e.preventDefault();
  if (e.key === 'F11')                               e.preventDefault();
}

// ── Boot ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
window.goToQ        = goToQ;
window.prevQ        = prevQ;
window.nextQ        = nextQ;
window.toggleReview = toggleReview;
window.confirmSubmit = confirmSubmit;
window.initFullscreenAndStart = initFullscreenAndStart;
window.downloadTestPDF = downloadTestPDF;
window.reEnterFullscreen = reEnterFullscreen;
window.showSolutions = showSolutions;

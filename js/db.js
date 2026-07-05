/**
 * QuizForge — Data Layer (db.js)
 * Refactored to act as a client for the Flask backend.
 */

const DB = (() => {

  const K_SESSION = 'qf_session';
  const K_ADMIN_PW = 'qf_admin_pw'; // Only used client-side for auto-fill or simpler routing

  const sget = k => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch(e) { return null; } };
  const sset = (k,v) => sessionStorage.setItem(k, JSON.stringify(v));
  
  // Basic fetch wrapper
  // credentials:'include' is required so the browser sends/stores the
  // server session cookie (admin login, student login) on every call.
  async function apiCall(endpoint, method='GET', body=null) {
    const opts = { method, headers: {}, credentials: 'include' };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(endpoint, opts);
    let data;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok && !data.error) data.error = `Request failed (${res.status})`;
    return data;
  }

  // Generate local UID for transient lists
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);

  return {
    async getTests() {
      const res = await apiCall('/api/tests');
      return res.tests || [];
    },
    async getAdminTests() {
      const res = await apiCall('/api/admin/tests');
      return res.tests || [];
    },
    async getTest(id) {
       const res = await apiCall('/api/tests/'+id);
       return res.test || null;
    },
    async getAdminTest(id) {
       const res = await apiCall('/api/admin/tests/'+id);
       return res.test || null;
    },
    async saveTest(test) {
       return await apiCall('/api/admin/tests', 'POST', test);
    },
    createTest() {
      return {
        id: uid(),
        title: '',
        description: '',
        duration: 30,
        active: false,
        marking: { correct: 4, incorrect: 1, unanswered: 0 },
        questions: []
      };
    },
    async deleteTest(id) {
      return await apiCall('/api/admin/tests/'+id, 'DELETE');
    },

    createQuestion(type, testMarking) {
      return {
        id: uid(),
        type,
        text: '',
        options: type.startsWith('mcq')
                 ? [{ id:uid(), text:'' }, { id:uid(), text:'' }, { id:uid(), text:'' }, { id:uid(), text:'' }]
                 : [],
        correct: [],
        marks: testMarking?.correct ?? 4,
        negMarks: testMarking?.incorrect ?? 1,
        solution: ''
      };
    },

    // Submissions
    async getAdminSubmissions() {
      return await apiCall('/api/admin/submissions');
    },
    async submitTest(testId, rollNo, studentName, answers) {
      return await apiCall(`/api/tests/${testId}/submit`, 'POST', { rollNo, studentName, answers });
    },
    async getSolutions(testId, rollNo) {
      return await apiCall(`/api/tests/${testId}/solutions?rollNo=${rollNo}`);
    },

    // Auth
    async register(data) {
      return await apiCall('/api/auth/register', 'POST', data);
    },
    async login(rollNo, idToken) {
      return await apiCall('/api/auth/login', 'POST', { rollNo, idToken });
    },
    async logout() {
      // Clears the server-side session cookie. Fire-and-forget is fine —
      // clearSession() below already wipes the local UI cache.
      return await apiCall('/api/auth/logout', 'POST');
    },
    async checkAdminPw(pw) {
      return await apiCall('/api/admin/pw', 'POST', { pw });
    },
    async adminLogout() {
      return await apiCall('/api/admin/logout', 'POST');
    },
    async checkAdminSession() {
      const res = await apiCall('/api/admin/check');
      return !!(res && res.isAdmin);
    },
    getSession() { return sget(K_SESSION); },
    setSession(student) { sset(K_SESSION, student); },
    clearSession() { sessionStorage.removeItem(K_SESSION); },
    
    // Tools
    uid,
    isAnswered(a) {
      return a !== undefined && a !== null && a !== '' && !(Array.isArray(a) && a.length === 0);
    }
  };
})();

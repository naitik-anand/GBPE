/**
 * QuizForge — Auth Layer (auth.js)
 *
 * Google Sign-In is currently SIMULATED. To enable real Google Auth:
 *
 *   1. Go to https://console.firebase.google.com
 *   2. Create project → Enable Authentication → Enable Google provider
 *   3. Add your web app → copy firebaseConfig
 *   4. Replace the FIREBASE INTEGRATION BLOCK below
 *
 * The rest of the code (registration, session, routing) doesn't change.
 */

const Auth = (() => {

  // ── State ─────────────────────────────────────────────
  let _googleResult = null;     // set after successful Google sign-in
  let _onAuthChange = null;     // callback for auth state changes

  
  // Firebase is initialized in index.html/admin.html (type="module")
  // and exposed via window.__firebaseAuth.


  async function _googleSignIn() {
    // Firebase objects are created by inline <script type="module"> in HTML
    if (!window.__firebaseAuth) {
      throw new Error('Firebase not initialized. Add firebaseConfig script in index.html/admin.html.');
    }
    const { auth, provider, signInWithPopup } = window.__firebaseAuth;
    const result = await signInWithPopup(auth, provider);
    // Grab the ID token so the server can independently verify this sign-in
    // rather than just trusting whatever uid/email the client reports.
    const idToken = await result.user.getIdToken();
    return {
      uid: result.user.uid,
      email: result.user.email,
      name: result.user.displayName || '',
      idToken,
    };
  }


  return {

    /* ─── Google Sign-In ─────────────────────────────── */

    async signInWithGoogle(btnEl) {
      if (btnEl) {
        btnEl.classList.add('loading');
        btnEl.disabled = true;
      }
      try {
        _googleResult = await _googleSignIn();
        if (btnEl) {
          btnEl.classList.remove('loading');
          btnEl.classList.add('verified');
          btnEl.innerHTML = `
            <svg class="google-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Google Verified ✓`;
          btnEl.disabled = false;
        }
        return { success: true, ..._googleResult };
      } catch (err) {
        if (btnEl) {
          btnEl.classList.remove('loading');
          btnEl.disabled = false;
        }
        _googleResult = null;
        return { success: false, error: err.message || 'Google sign-in failed' };
      }
    },

    getGoogleResult() { return _googleResult; },

    clearGoogleResult() { _googleResult = null; },

    isGoogleVerified() { return _googleResult !== null; },

    /* ─── Session ────────────────────────────────────── */

    getStudent() {
      return DB.getSession();
    },

    isLoggedIn() {
      return !!DB.getSession();
    },

    login(student) {
      DB.setSession(student);
    },

    logout() {
      DB.clearSession();
      DB.logout(); // clears the server-side session cookie too (fire-and-forget)
      _googleResult = null;
    },

    /* ─── Registration ───────────────────────────────── */

    async register(data) {
      if (!data.name || !data.name.trim()) return { error: 'Name is required' };
      if (!data.dob)                       return { error: 'Date of birth is required' };
      if (!data.rollNo || !/^\d{6}$/.test(data.rollNo)) return { error: 'Roll number must be exactly 6 digits' };
      if (!_googleResult)                  return { error: 'Please verify with Google first' };

      const payload = {
        rollNo:      data.rollNo,
        name:        data.name.trim(),
        dob:         data.dob,
        googleEmail: _googleResult.email,
        googleUid:   _googleResult.uid,
        idToken:     _googleResult.idToken,
      };
      
      try {
        const res = await DB.register(payload);
        if (res.error) return { error: res.error };
        
        DB.setSession(res.student);
        _googleResult = null;
        return { success: true, student: res.student };
      } catch (err) {
        return { error: "Network error during registration" };
      }
    },

    /* ─── Login (returning student) ─────────────────── */

    async loginByRoll(rollNo) {
      if (!rollNo || !/^\d{6}$/.test(rollNo)) return { error: 'Enter your 6-digit roll number' };
      if (!_googleResult)                  return { error: 'Please verify with Google first' };

      try {
        const res = await DB.login(rollNo, _googleResult.idToken);
        if (res.error) return { error: res.error };
        
        DB.setSession(res.student);
        _googleResult = null;
        return { success: true, student: res.student };
      } catch (err) {
        return { error: "Network error during login" };
      }
    },

  };

})();

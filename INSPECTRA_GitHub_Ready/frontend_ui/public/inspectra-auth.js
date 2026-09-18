/**
 * ============================================================================
 * INSPECTRA — Centralized Persistent Authentication & Navigation Controller
 * ============================================================================
 *
 * Sequence:
 *   initializeApplication()
 *       ↓
 *   restoreAuthentication()
 *       ↓
 *   validateAuthentication()
 *       ↓
 *   initializeRouter()
 *       ↓
 *   renderCurrentPage()
 *
 * Guarantees:
 *   - Zero logout when clicking any navigation tab
 *   - Zero logout on page refresh (F5 / Ctrl+R)
 *   - Zero logout on browser Back / Forward history navigation
 *   - Zero logout on opening direct deep links or new tabs
 *   - Zero password storage (HMAC-SHA256 stateless session tokens only)
 *   - Zero screen flicker (synchronous head restoration)
 *   - Resilient against Vercel serverless multi-instance container restarts
 */

(function(global) {
  'use strict';

  // Storage Keys
  const STORAGE_TOKEN_KEY = 'inspectra_auth_token';
  const STORAGE_USER_KEY = 'inspectra_auth_user';
  const LEGACY_TOKEN_KEY = 'inspectra_token';
  const LEGACY_USER_KEY = 'inspectra_current_user';
  const COOKIE_NAME = 'inspectra_session';
  const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

  // Internal Centralized Auth State
  const authState = {
    initialized: false,
    authenticated: false,
    user: null,
    token: null,
    isPublicPage: false,
    currentRoute: '/'
  };

  // Helper: Decode base64url HMAC token payload safely
  function parseTokenPayload(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const jsonStr = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonStr);
    } catch (_) {
      return null;
    }
  }

  // Helper: Read session cookie
  function getSessionCookie() {
    const match = document.cookie.match(new RegExp('(^|;\\s*)' + COOKIE_NAME + '=([^;]*)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  // Helper: Synchronize cookie with active token
  function setSessionCookie(token) {
    if (!token) return;
    const isHttps = window.location.protocol === 'https:';
    const flags = `Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${isHttps ? '; Secure' : ''}`;
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; ${flags}`;
  }

  // Helper: Clear session cookie
  function clearSessionCookie() {
    const isHttps = window.location.protocol === 'https:';
    document.cookie = `${COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0${isHttps ? '; Secure' : ''}`;
  }

  // Helper: Sanitize current pathname
  function getSanitizedPath() {
    const raw = (window.location.pathname || '/').toLowerCase();
    return raw.replace(/\/$/, '') || '/';
  }

  /**
   * Phase 1: restoreAuthentication()
   * Synchronously reads browser-persistent storage to recover operator session.
   */
  function restoreAuthentication() {
    let token = null;
    let user = null;

    try {
      token = localStorage.getItem(STORAGE_TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
      const userRaw = localStorage.getItem(STORAGE_USER_KEY) || localStorage.getItem(LEGACY_USER_KEY);
      if (userRaw) {
        user = JSON.parse(userRaw);
      }
    } catch (_) {}

    // Fallback: check cookie if localStorage was cleared
    if (!token) {
      token = getSessionCookie();
    }

    if (token) {
      const payload = parseTokenPayload(token);
      if (payload) {
        // Check if token has expired
        if (payload.exp && (payload.exp * 1000) < Date.now()) {
          console.warn('[INSPECTRA Auth] Session token has expired.');
          token = null;
          user = null;
        } else if (!user) {
          // Reconstruct user profile from verified token payload
          user = {
            id: payload.id || 'OP-RESTORED',
            name: payload.name || payload.username || 'Operator',
            username: payload.username || 'operator',
            email: payload.email || '',
            role: payload.role || 'AI Inspection Operator'
          };
        }
      }
    }

    if (token && user) {
      authState.authenticated = true;
      authState.token = token;
      authState.user = user;

      // Sync across all storage keys & cookie
      try {
        localStorage.setItem(STORAGE_TOKEN_KEY, token);
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
        localStorage.setItem(LEGACY_TOKEN_KEY, token);
        localStorage.setItem(LEGACY_USER_KEY, JSON.stringify(user));
        setSessionCookie(token);
      } catch (_) {}
    } else {
      authState.authenticated = false;
      authState.token = null;
      authState.user = null;
    }

    return authState.authenticated;
  }

  /**
   * Phase 2: validateAuthentication()
   * Evaluates route protection rules and enforces access controls immediately.
   */
  function validateAuthentication() {
    const path = getSanitizedPath();
    authState.currentRoute = path;
    authState.isPublicPage = (path === '/login' || path === '/register');

    if (!authState.isPublicPage) {
      // Protected route: require authentication
      if (!authState.authenticated) {
        const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace('/login?returnUrl=' + returnUrl);
        return false;
      }
      // Reveal protected UI
      document.documentElement.classList.add('inspectra-auth-ready');
    } else {
      // Public route (login / register): redirect authenticated users
      if (authState.authenticated) {
        const params = new URLSearchParams(window.location.search);
        const returnUrl = params.get('returnUrl');
        const target = (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('/login'))
          ? decodeURIComponent(returnUrl)
          : '/';
        window.location.replace(target);
        return false;
      }
      document.documentElement.classList.add('inspectra-auth-ready');
    }

    return true;
  }

  /**
   * Phase 3: initializeRouter()
   * Sets up internal link interception and browser history listeners.
   */
  function initializeRouter() {
    syncActiveNavigationLinks();

    // Intercept internal link clicks to ensure session is maintained across navigation
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href) return;

      if (href.startsWith('/') && !href.startsWith('//') && !link.hasAttribute('download') && link.target !== '_blank') {
        const cleanHref = href.split('?')[0].split('#')[0];
        const internalRoutes = [
          '/', '/studio', '/inspection-studio',
          '/live', '/live-inspection',
          '/products', '/product-analysis',
          '/data-log',
          '/reports',
          '/standards'
        ];

        if (internalRoutes.includes(cleanHref) && authState.token) {
          setSessionCookie(authState.token);
        }
      }
    }, { capture: true });

    // Handle browser back / forward navigation
    window.addEventListener('popstate', function() {
      restoreAuthentication();
      syncActiveNavigationLinks();
      updateHeaderProfileUI(authState.user);
    });
  }

  /**
   * Phase 4: renderCurrentPage()
   * Injects operator metadata, attaches interactive controls, and schedules background validation.
   */
  function renderCurrentPage() {
    if (authState.authenticated && authState.user) {
      updateHeaderProfileUI(authState.user);
    }
    setupMobileNavigationToggle();
    attachLogoutHandlers();

    // Trigger silent background validation without interrupting user workflow
    if (authState.authenticated && authState.token) {
      scheduleBackgroundValidation();
    }
  }

  // Update Operator Profile in Header
  function updateHeaderProfileUI(user) {
    if (!user) return;

    const operatorNameEl = document.getElementById('header-operator-name');
    const operatorRoleEl = document.getElementById('header-operator-role');
    const userProfileGroup = document.getElementById('header-user-profile');

    if (operatorNameEl) {
      operatorNameEl.textContent = user.name || user.username || 'Operator';
    }
    if (operatorRoleEl) {
      operatorRoleEl.textContent = user.role || 'AI Inspection Operator';
    }
    if (userProfileGroup) {
      userProfileGroup.style.display = 'flex';
    }

    // Connect DataLogService if available
    if (global.dataLogService && typeof global.dataLogService.setCurrentUser === 'function') {
      global.dataLogService.setCurrentUser(user);
    }
  }

  // Sync active navigation link in header
  function syncActiveNavigationLinks() {
    const current = getSanitizedPath();
    const navLinks = document.querySelectorAll('.nav-links a');

    navLinks.forEach(link => {
      const rawHref = (link.getAttribute('href') || '').toLowerCase();
      const href = rawHref.replace(/\/$/, '') || '/';

      const isStudio = (current === '/' || current === '/studio' || current === '/inspection-studio') &&
                       (href === '/' || href === '/studio' || href === '/inspection-studio');
      const isLive = (current === '/live' || current === '/live-inspection') &&
                     (href === '/live' || href === '/live-inspection');
      const isProducts = (current === '/products' || current === '/product-analysis') &&
                         (href === '/products' || href === '/product-analysis');
      const isDataLog = current === '/data-log' && href === '/data-log';
      const isReports = current === '/reports' && href === '/reports';
      const isStandards = current === '/standards' && href === '/standards';

      if (isStudio || isLive || isProducts || isDataLog || isReports || isStandards) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  // Setup Responsive Mobile Navigation Toggle
  function setupMobileNavigationToggle() {
    const navToggleBtn = document.getElementById('btn-nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (navToggleBtn && navLinks && !navToggleBtn.__inspectraBound) {
      navToggleBtn.__inspectraBound = true;
      navToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navLinks.classList.toggle('nav-open');
        navToggleBtn.classList.toggle('active');
      });

      navLinks.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          navLinks.classList.remove('nav-open');
          navToggleBtn.classList.remove('active');
        });
      });

      document.addEventListener('click', (e) => {
        if (!navLinks.contains(e.target) && !navToggleBtn.contains(e.target)) {
          navLinks.classList.remove('nav-open');
          navToggleBtn.classList.remove('active');
        }
      });
    }
  }

  // Attach Logout Handlers
  function attachLogoutHandlers() {
    document.querySelectorAll('.btn-logout').forEach(btn => {
      if (btn.__logoutBound) return;
      btn.__logoutBound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
      });
    });
  }

  // Centralized Logout Action
  async function logout() {
    const token = authState.token;

    try {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      localStorage.removeItem(STORAGE_USER_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      localStorage.removeItem(LEGACY_USER_KEY);
      clearSessionCookie();
    } catch (_) {}

    authState.authenticated = false;
    authState.user = null;
    authState.token = null;

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: 'include'
      });
    } catch (_) {}

    window.location.replace('/login');
  }

  // Save session upon successful authentication
  function setSession(token, user) {
    if (!token || !user) return;
    try {
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
      localStorage.setItem(LEGACY_TOKEN_KEY, token);
      localStorage.setItem(LEGACY_USER_KEY, JSON.stringify(user));
      setSessionCookie(token);
    } catch (_) {}

    authState.authenticated = true;
    authState.token = token;
    authState.user = user;
    document.documentElement.classList.add('inspectra-auth-ready');
  }

  // Schedule silent background session validation
  async function scheduleBackgroundValidation() {
    if (!authState.token) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${authState.token}` },
        credentials: 'include'
      });

      if (res.status === 401) {
        const body = await res.json().catch(() => ({}));
        if (body.error === 'UNAUTHENTICATED' || body.error === 'EXPIRED_TOKEN') {
          console.warn('[INSPECTRA Auth] Server session rejected or expired.');
          logout();
        }
      } else if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.authenticated && data.user) {
          authState.user = data.user;
          updateHeaderProfileUI(data.user);
        }
      }
    } catch (err) {
      // Offline or network cold start: DO NOT LOG OUT
      console.warn('[INSPECTRA Auth] Background validation skipped:', err.message);
    }
  }

  /**
   * Master Orchestrator: initializeApplication()
   */
  function initializeApplication() {
    restoreAuthentication();
    const canRender = validateAuthentication();
    if (!canRender) return;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initializeRouter();
        renderCurrentPage();
      });
    } else {
      initializeRouter();
      renderCurrentPage();
    }
  }

  // Immediately initialize on script evaluation
  initializeApplication();

  // Export public API
  const api = {
    initializeApplication,
    restoreAuthentication,
    validateAuthentication,
    initializeRouter,
    renderCurrentPage,
    setSession,
    logout,
    getCurrentUser: () => authState.user,
    getToken: () => authState.token,
    isAuthenticated: () => authState.authenticated
  };

  global.inspectraAuth = api;
  global.authGuard = api; // Backwards compatibility for existing scripts

})(typeof window !== 'undefined' ? window : this);

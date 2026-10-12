import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from '../api/client.js';
import { setMeta, getMeta, clearAll } from '../db/offline.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  /** Cache the profile so an offline cold start still knows who you are. */
  const persist = useCallback(async (u) => {
    setUser(u);
    if (u) await setMeta('user', u);
  }, []);

  const bootstrap = useCallback(async () => {
    // Config is harmless to fetch signed-out and tells us the bounty limits.
    api.config().then((r) => {
      setConfig(r.config);
      setMeta('config', r.config);
    }).catch(async () => {
      const cached = await getMeta('config');
      if (cached) setConfig(cached);
    });

    if (!getToken()) {
      setLoading(false);
      return;
    }

    try {
      const { user: me } = await api.auth.me();
      await persist(me);
    } catch (err) {
      if (err.isOffline) {
        // Offline with a token: trust the cached profile rather than booting
        // the user out of their own app because the wifi dropped.
        const cached = await getMeta('user');
        if (cached) setUser(cached);
      } else {
        setToken(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [persist]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // The API client fires this when a request comes back 401.
  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setToken(null);
    };
    window.addEventListener('madad:unauthorized', onUnauthorized);
    return () => window.removeEventListener('madad:unauthorized', onUnauthorized);
  }, []);

  const login = async (credentials) => {
    const res = await api.auth.login(credentials);
    setToken(res.token);
    await persist(res.user);
    return res.user;
  };

  const register = async (data) => {
    const res = await api.auth.register(data);
    setToken(res.token);
    await persist(res.user);
    return res.user;
  };

  const verifyOtp = async (data) => {
    const res = await api.auth.verifyOtp(data);
    setToken(res.token);
    await persist(res.user);
    return res.user;
  };

  const logout = async () => {
    setToken(null);
    setUser(null);
    await clearAll();
  };

  /** Merge a partial update (e.g. a new trust score from a socket event). */
  const patchUser = useCallback((patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      setMeta('user', next);
      return next;
    });
  }, []);

  const refresh = async () => {
    try {
      const { user: me } = await api.auth.me();
      await persist(me);
      return me;
    } catch {
      return user;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        config,
        loading,
        isAuthenticated: Boolean(user),
        isAdmin: user?.role === 'admin',
        login,
        register,
        verifyOtp,
        logout,
        patchUser,
        refresh,
        setUser: persist,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export default AuthContext;

'use client';

import { useState, useEffect, useCallback } from 'react';

export interface UserAccount {
  id: string;
  username: string;
  createdAt: number;
}

export function useAuth() {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkMe = useCallback(async () => {
    try {
      const res = await fetch('/api/wulian/auth/me');
      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (e) {
      console.error('Failed to check auth status:', e);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkMe();
  }, [checkMe]);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/wulian/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        return true;
      } else {
        setError(data.error || '登录失败');
        return false;
      }
    } catch (e) {
      setError('连接服务器失败');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (username: string, password: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/wulian/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        return true;
      } else {
        setError(data.error || '注册失败');
        return false;
      }
    } catch (e) {
      setError('连接服务器失败');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await fetch('/api/wulian/auth/logout', { method: 'POST' });
      if (res.ok) {
        setUser(null);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Logout failed:', e);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    user,
    loading,
    error,
    login,
    register,
    logout,
    checkMe,
    isGuest: !user && !loading,
  };
}

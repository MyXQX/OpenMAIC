'use client';

import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { loadStageData } from '@/lib/utils/stage-storage';

export function AuthHeader() {
  const { user, login, register, logout, isGuest } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 数据迁移核心逻辑
  const migrateGuestData = async () => {
    try {
      const localProfileRaw = localStorage.getItem('wulian_profile_guest');
      const profile = localProfileRaw ? JSON.parse(localProfileRaw) : undefined;

      const classrooms = [];
      const keys = Object.keys(localStorage);

      for (const key of keys) {
        if (key.startsWith('wulian_guest_classroom_')) {
          const id = localStorage.getItem(key);
          if (id) {
            const localData = await loadStageData(id);
            const personalizationRaw = localStorage.getItem(`wulian_guest_personalization_${id}`);
            const personalization = personalizationRaw ? JSON.parse(personalizationRaw) : undefined;

            if (localData && personalization) {
              classrooms.push({
                id,
                owner: 'guest',
                chapterId: key.replace('wulian_guest_classroom_', ''),
                stage: localData.stage,
                scenes: localData.scenes,
                personalization,
                simulators: personalization.selectedSimulatorIds || [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            }
          }
        }
      }

      if (profile || classrooms.length > 0) {
        const res = await fetch('/api/wulian/auth/migrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile, classrooms }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          // 清除本地访客缓存
          localStorage.removeItem('wulian_profile_guest');
          for (const key of keys) {
            if (key.startsWith('wulian_guest_classroom_')) {
              const id = localStorage.getItem(key);
              localStorage.removeItem(key);
              if (id) {
                localStorage.removeItem(`wulian_guest_personalization_${id}`);
              }
            }
          }
          alert(`数据迁移成功！已同步 ${data.migratedCount} 个课堂，冲突 ${data.conflictCount} 个（以云端为准）。`);
        }
      }
    } catch (e) {
      console.error('Data migration failed:', e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    const p = password;
    if (!u || !p) {
      setErr('请填写完整用户名和密码');
      return;
    }
    setErr(null);
    setBusy(true);

    try {
      let ok = false;
      if (isRegister) {
        ok = await register(u, p);
      } else {
        ok = await login(u, p);
      }

      if (ok) {
        setModalOpen(false);
        setUsername('');
        setPassword('');
        // 成功登录后触发数据迁移
        await migrateGuestData();
        window.location.reload(); // 重新加载以更新状态
      } else {
        setErr(isRegister ? '注册失败，用户名可能已存在' : '用户名或密码错误');
      }
    } catch (err) {
      setErr('连接服务器失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-auth-header-container">
      {user ? (
        <div className="w-auth-user-bar">
          <span className="w-welcome">
            👤 欢迎，<strong>{user.username}</strong>
          </span>
          <button type="button" className="w-auth-btn secondary" onClick={() => logout().then(() => window.location.reload())}>
            退出登录
          </button>
        </div>
      ) : (
        <div className="w-auth-user-bar">
          <span className="w-guest-tag">访客模式</span>
          <button type="button" className="w-auth-btn" onClick={() => { setIsRegister(false); setModalOpen(true); }}>
            登录账号
          </button>
          <button type="button" className="w-auth-btn secondary" onClick={() => { setIsRegister(true); setModalOpen(true); }}>
            注册
          </button>
        </div>
      )}

      {modalOpen && (
        <div className="w-auth-modal-overlay">
          <div className="w-auth-modal-card">
            <div className="modal-header">
              <h3>{isRegister ? '注册新账号' : '登录物联智讲'}</h3>
              <button type="button" className="close-btn" onClick={() => setModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <label>
                <span>用户名</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入用户名"
                  disabled={busy}
                  required
                />
              </label>
              <label>
                <span>密码</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  disabled={busy}
                  required
                />
              </label>

              {err && <div className="form-error">{err}</div>}

              <button type="submit" className="submit-btn" disabled={busy}>
                {busy ? '请稍候...' : isRegister ? '确认注册并登录' : '立即登录'}
              </button>

              <div className="toggle-mode">
                <button
                  type="button"
                  onClick={() => { setIsRegister(!isRegister); setErr(null); }}
                  disabled={busy}
                >
                  {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        .w-auth-header-container {
          position: absolute;
          top: 14px;
          right: 28px;
          z-index: 100;
        }
        .w-auth-user-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(24, 35, 61, 0.85);
          border: 1px solid var(--w-border);
          border-radius: 20px;
          padding: 4px 14px;
          font-size: 13px;
          backdrop-filter: blur(10px);
        }
        .w-welcome {
          color: var(--w-ink);
        }
        .w-guest-tag {
          font-size: 11px;
          background: rgba(244, 154, 90, 0.15);
          color: var(--w-warn);
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid rgba(244, 154, 90, 0.3);
        }
        .w-auth-btn {
          background: var(--w-accent);
          color: #1a1a1a;
          border: 0;
          border-radius: 12px;
          padding: 4px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .w-auth-btn:hover {
          background: var(--w-accent-soft);
        }
        .w-auth-btn.secondary {
          background: transparent;
          border: 1px solid var(--w-border);
          color: var(--w-ink-soft);
        }
        .w-auth-btn.secondary:hover {
          color: var(--w-ink);
          border-color: var(--w-accent-soft);
        }

        /* 模态框 */
        .w-auth-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(7, 12, 22, 0.7);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
        }
        .w-auth-modal-card {
          background: var(--w-panel);
          border: 1px solid var(--w-border);
          border-radius: var(--w-radius);
          width: 360px;
          padding: 22px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          animation: modal-enter 0.2s ease-out;
        }
        @keyframes modal-enter {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .w-auth-modal-card .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--w-border);
          padding-bottom: 10px;
          margin-bottom: 16px;
        }
        .w-auth-modal-card .modal-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }
        .w-auth-modal-card .close-btn {
          background: none;
          border: 0;
          color: var(--w-ink-soft);
          font-size: 20px;
          cursor: pointer;
        }
        .w-auth-modal-card .close-btn:hover {
          color: var(--w-bad);
        }

        .modal-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .modal-form label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
          color: var(--w-ink-soft);
        }
        .modal-form input {
          background: var(--w-panel-2);
          border: 1px solid var(--w-border);
          color: var(--w-ink);
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 13px;
          outline: none;
        }
        .modal-form input:focus {
          border-color: var(--w-accent);
        }
        .form-error {
          font-size: 12px;
          color: var(--w-bad);
          background: rgba(239, 108, 140, 0.1);
          border: 1px solid rgba(239, 108, 140, 0.3);
          border-radius: 4px;
          padding: 6px;
        }
        .submit-btn {
          background: var(--w-accent);
          color: #1a1a1a;
          border: 0;
          border-radius: 6px;
          padding: 10px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .submit-btn:hover {
          background: var(--w-accent-soft);
        }
        .toggle-mode {
          text-align: center;
          margin-top: 8px;
        }
        .toggle-mode button {
          background: none;
          border: 0;
          color: var(--w-accent-soft);
          font-size: 12px;
          cursor: pointer;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}

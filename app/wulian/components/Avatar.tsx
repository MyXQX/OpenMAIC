'use client';

import type { ScientistPersona, AgentRole } from '@/lib/wulian/types';

export function ScientistAvatar({
  persona,
  size = 'md',
}: {
  persona: ScientistPersona;
  size?: 'sm' | 'md';
}) {
  const initials = persona.englishName
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return <span className={`w-avatar ${persona.visualKey}${size === 'sm' ? ' sm' : ''}`}>{initials}</span>;
}

const ROLE_VISUAL: Record<Exclude<AgentRole, 'teacher'>, { initials: string; visualKey: string }> = {
  assistant: { initials: '麦', visualKey: 'emerald' },
  classmate: { initials: '恒', visualKey: 'rose' },
};

export function RoleAvatar({ role, size = 'md' }: { role: AgentRole; size?: 'sm' | 'md' }) {
  if (role === 'teacher') {
    return <span className={`w-avatar amber${size === 'sm' ? ' sm' : ''}`}>师</span>;
  }
  const v = ROLE_VISUAL[role];
  return <span className={`w-avatar ${v.visualKey}${size === 'sm' ? ' sm' : ''}`}>{v.initials}</span>;
}

export function UserAvatar({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return <span className={`w-avatar slate${size === 'sm' ? ' sm' : ''}`}>我</span>;
}

'use client';

import React from 'react';

export function Card({
  title,
  right,
  children,
  style,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section
      style={{
        background: 'var(--card)',
        border: '1px solid var(--stroke)',
        borderRadius: 16,
        padding: 14,
        boxShadow: 'var(--shadow)',
        backdropFilter: 'blur(10px)',
        ...style,
      }}
    >
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>{title}</div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Pill({
  label,
  tone = 'muted',
}: {
  label: string;
  tone?: 'muted' | 'good' | 'warn' | 'bad' | 'accent';
}) {
  const bg =
    tone === 'good'
      ? 'rgba(22,163,74,.18)'
      : tone === 'warn'
      ? 'rgba(245,158,11,.18)'
      : tone === 'bad'
      ? 'rgba(239,68,68,.18)'
      : tone === 'accent'
      ? 'rgba(124,58,237,.20)'
      : 'rgba(154,163,178,.14)';

  const br =
    tone === 'good'
      ? 'rgba(22,163,74,.35)'
      : tone === 'warn'
      ? 'rgba(245,158,11,.35)'
      : tone === 'bad'
      ? 'rgba(239,68,68,.35)'
      : tone === 'accent'
      ? 'rgba(124,58,237,.35)'
      : 'rgba(154,163,178,.25)';

  const col =
    tone === 'good'
      ? '#86efac'
      : tone === 'warn'
      ? '#fde68a'
      : tone === 'bad'
      ? '#fecaca'
      : tone === 'accent'
      ? '#ddd6fe'
      : 'var(--muted)';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 999,
        border: `1px solid ${br}`,
        background: bg,
        color: col,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  tone = 'default',
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'primary' | 'ghost' | 'danger';
  style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid var(--stroke)',
    background: 'rgba(255,255,255,.04)',
    color: 'var(--text)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    fontWeight: 800,
    letterSpacing: 0.2,
  };

  const byTone: Record<string, React.CSSProperties> = {
    default: {},
    ghost: { background: 'transparent' },
    danger: { border: '1px solid rgba(239,68,68,.35)', background: 'rgba(239,68,68,.12)' },
    primary: {
      border: '1px solid rgba(124,58,237,.45)',
      background: 'linear-gradient(135deg, rgba(124,58,237,.90), rgba(34,197,94,.40))',
      animation: 'glowPulse 2.2s ease-in-out infinite',
    },
  };

  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, ...byTone[tone], ...style }}>
      {children}
    </button>
  );
}

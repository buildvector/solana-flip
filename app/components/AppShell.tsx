'use client';

import React from 'react';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh' }}>
      <div
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          padding: '28px 18px 60px',
          display: 'grid',
          gap: 16,
        }}
      >
        {children}
      </div>

      <div style={{ opacity: 0.65, fontSize: 12, padding: '18px 18px 26px', textAlign: 'center' }}>
        <span className="mono">P2P Flip MVP</span> · Fast UI, minimal surface area
      </div>
    </div>
  );
}

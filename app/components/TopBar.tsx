'use client';

import React from 'react';
import { PublicKey } from '@solana/web3.js';
import dynamic from 'next/dynamic';
import { Pill } from './Card';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

function short(pk?: string) {
  if (!pk) return '—';
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

export default function TopBar({
  connectedPk,
  treasuryPk,
  rpcLabel,
}: {
  connectedPk?: PublicKey | null;
  treasuryPk: PublicKey;
  rpcLabel: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '6px 2px',
      }}
    >
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontWeight: 950, letterSpacing: 0.2, fontSize: 18 }}>P2P Coin Flip</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Pill label={`RPC: ${rpcLabel}`} tone="muted" />
          <Pill label={`Treasury/Pot: ${short(treasuryPk.toBase58())}`} tone="accent" />
          <Pill label={`Connected: ${connectedPk ? short(connectedPk.toBase58()) : '—'}`} tone={connectedPk ? 'good' : 'warn'} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <WalletMultiButton />
      </div>
    </div>
  );
}

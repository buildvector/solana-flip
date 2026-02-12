'use client';

import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export function fmtSolFromLamports(lamports: number, dp = 6) {
  return `${(lamports / LAMPORTS_PER_SOL).toFixed(dp)} SOL`;
}
export function fmtLamports(lamports: number) {
  return `${lamports.toLocaleString('en-US')} lamports`;
}
export function fmtSol(sol: number, dp = 3) {
  return `${sol.toFixed(dp)} SOL`;
}

export function Amount({
  lamports,
  strong = false,
  dp = 6,
}: {
  lamports: number;
  strong?: boolean;
  dp?: number;
}) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontWeight: strong ? 900 : 700 }}>{fmtSolFromLamports(lamports, dp)}</div>
      <div style={{ fontSize: 12, opacity: 0.55 }}>{fmtLamports(lamports)}</div>
    </div>
  );
}

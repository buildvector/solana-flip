'use client';

import { Pill } from './ui';

export default function Header() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-xs uppercase tracking-widest text-zinc-400">P2P</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Solana Flip</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Minimal, fast P2P coinflip. Deposits go to treasury/pot. Winner is resolved server-side.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Pill>3% fee / deposit</Pill>
        <Pill>Leave refund 97%</Pill>
        <Pill>No house edge</Pill>
      </div>
    </div>
  );
}

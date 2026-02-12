'use client';

import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Button, Pill, Hint, Mono, Label } from './ui';

function fmtLamports(l: number) {
  return `${Math.max(0, Math.floor(l)).toLocaleString('en-US')} lamports`;
}
function fmtSolFromLamports(l: number) {
  return `${(l / LAMPORTS_PER_SOL).toFixed(6)} SOL`;
}
function fmtSol(sol: number) {
  return `${Number(sol || 0).toFixed(4)} SOL`;
}

export default function PreflightModal(props: {
  open: boolean;
  busy: boolean;
  round: any | null;
  reservationToken: string | null;
  txSig: string | null;
  depositFeeBps: number;
  preFeeLamports: number;
  prePotLamports: number;
  short: (pk?: string) => string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const {
    open,
    busy,
    round,
    reservationToken,
    txSig,
    depositFeeBps,
    preFeeLamports,
    prePotLamports,
    short,
    onCancel,
    onConfirm,
  } = props;

  if (!open || !round) return null;

  const feePct = (depositFeeBps / 100).toFixed(0);
  const betSol = Number(round?.betSol ?? 0);

  // Winner payout = 2× (bet minus fee)
  const payoutLamports = Math.max(0, prePotLamports * 2);

  const ringHover =
    'hover:shadow-[0_0_0_1px_rgba(168,85,247,0.70),0_0_0_4px_rgba(168,85,247,0.18),0_18px_60px_rgba(0,0,0,0.45)]';

  return (
    <div
      className="fixed inset-0 z-[9999] grid place-items-center bg-black/70 p-4"
      onClick={() => (!busy ? onCancel() : null)}
    >
      <div
        className={[
          'w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-zinc-950',
          'shadow-[0_30px_140px_rgba(0,0,0,0.8)]',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm join"
      >
        {/* Top glow strip */}
        <div className="relative">
          <div className="absolute inset-0 bg-[radial-gradient(700px_120px_at_20%_0%,rgba(168,85,247,0.22),transparent_60%),radial-gradient(700px_120px_at_80%_0%,rgba(34,197,94,0.14),transparent_60%)]" />
          <div className="relative flex items-start justify-between gap-4 p-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-lg font-semibold tracking-tight">Confirm join</div>
                <Pill tone="purple">seat lock 30s</Pill>
                {reservationToken ? <Pill>reserved</Pill> : null}
              </div>

              <Hint className="mt-2">
                Flip ID: <span className="text-zinc-300">{String(round.id)}</span>
                <span className="text-zinc-600"> · </span>
                Creator <span className="font-mono text-zinc-300">{short(round.creator)}</span>
              </Hint>
            </div>

            <Button variant="ghost" onClick={onCancel} disabled={busy} className={ringHover}>
              Close
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 pt-0">
          <div className="grid gap-4 md:grid-cols-[180px_1fr] md:items-stretch">
            {/* Preview */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Preview</div>

              <div className="mt-3 grid place-items-center">
                <div className={busy ? 'coin busy' : 'coin'}>
                  {/* Front: Solana */}
                  <div className="coin-face coin-front">
                    <SolanaMark />
                  </div>

                  {/* Back: purple sad face */}
                  <div className="coin-face coin-back">
                    <SadFace />
                  </div>
                </div>
              </div>

              <div className="mt-3 text-center text-xs text-zinc-500">
                {busy ? 'Opening Phantom…' : 'Ready to deposit'}
              </div>
            </div>

            {/* Breakdown */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-zinc-400">Deposit breakdown</div>
                  <Hint className="mt-1">
                    You’ll sign a transfer to the pot. Fee is <span className="text-zinc-300">{feePct}%</span>.
                  </Hint>
                </div>
                <Pill tone="green">{fmtSol(betSol)}</Pill>
              </div>

              <div className="mt-4 grid gap-3">
                <div className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <div>
                    <Label>Fee ({feePct}%)</Label>
                    <Hint className="mt-1">Stays in treasury.</Hint>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{fmtSolFromLamports(preFeeLamports)}</div>
                    <Mono className="text-[11px] text-zinc-500">{fmtLamports(preFeeLamports)}</Mono>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <div>
                    <Label>Potential payout</Label>
                    <Hint className="mt-1">Winner receives both deposits.</Hint>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{fmtSolFromLamports(payoutLamports)}</div>
                    <Mono className="text-[11px] text-zinc-500">2× after-fee</Mono>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-xs text-zinc-400">
                Phantom will open a transaction to deposit into <span className="text-zinc-300">treasury/pot</span>.
              </div>
            </div>
          </div>

          {/* Tx sig */}
          {txSig ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Transaction</div>
              <div className="mt-2 text-xs text-zinc-500">Signature</div>
              <div className="mt-1 break-all font-mono text-xs text-zinc-200">{txSig}</div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button variant="ghost" onClick={onCancel} disabled={busy} className={ringHover}>
              Cancel
            </Button>

            <Button onClick={onConfirm} disabled={busy} className={ringHover + ' min-w-[220px]'}>
              {busy ? 'Opening Phantom…' : 'Confirm & open Phantom'}
            </Button>
          </div>
        </div>

        <style jsx>{`
          .coin {
            width: 92px;
            height: 92px;
            position: relative;
            transform-style: preserve-3d;
            border-radius: 999px;
            box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.12) inset;
            background: radial-gradient(
              120px 80px at 30% 20%,
              rgba(255, 255, 255, 0.18),
              rgba(255, 255, 255, 0.05) 45%,
              rgba(0, 0, 0, 0.25) 100%
            );
            overflow: hidden;
          }

          .coin.busy {
            animation: flip 1.1s linear infinite;
          }

          /* IMPORTANT: prevents “see-through” (your FLIP/other face bleeding through) */
          .coin-face {
            position: absolute;
            inset: 0;
            display: grid;
            place-items: center;
            border-radius: 999px;
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
            transform-style: preserve-3d;
            background: radial-gradient(
              120px 80px at 30% 20%,
              rgba(255, 255, 255, 0.10),
              rgba(0, 0, 0, 0.18) 55%,
              rgba(0, 0, 0, 0.28) 100%
            );
          }

          .coin-front {
            transform: translateZ(2px);
          }

          .coin-back {
            transform: rotateY(180deg) translateZ(2px);
          }

          .solana {
            width: 58px;
            height: 58px;
            filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.55));
            opacity: 0.95;
          }

          .sad {
            width: 56px;
            height: 56px;
            filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.55));
            opacity: 0.95;
          }

          @keyframes flip {
            0% {
              transform: rotateY(0deg);
            }
            100% {
              transform: rotateY(720deg);
            }
          }
        `}</style>
      </div>
    </div>
  );
}

function SolanaMark() {
  return (
    <svg viewBox="0 0 256 256" className="solana" aria-hidden="true">
      <defs>
        <linearGradient id="solg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(168,85,247)" />
          <stop offset="0.55" stopColor="rgb(59,130,246)" />
          <stop offset="1" stopColor="rgb(34,197,94)" />
        </linearGradient>
      </defs>

      <path
        d="M54 78c4-4 9-6 15-6h134c3 0 5 4 3 6l-20 20c-4 4-9 6-15 6H37c-3 0-5-4-3-6l20-20z"
        fill="url(#solg)"
      />
      <path
        d="M54 122c4-4 9-6 15-6h134c3 0 5 4 3 6l-20 20c-4 4-9 6-15 6H37c-3 0-5-4-3-6l20-20z"
        fill="url(#solg)"
        opacity="0.9"
      />
      <path
        d="M54 166c4-4 9-6 15-6h134c3 0 5 4 3 6l-20 20c-4 4-9 6-15 6H37c-3 0-5-4-3-6l20-20z"
        fill="url(#solg)"
        opacity="0.8"
      />
    </svg>
  );
}

function SadFace() {
  // simple “sad” face in the same violet vibe as your ring
  const stroke = 'rgba(168,85,247,0.95)';
  const fill = 'rgba(168,85,247,0.10)';

  return (
    <svg viewBox="0 0 64 64" className="sad" aria-hidden="true">
      <circle cx="32" cy="32" r="22" fill={fill} stroke={stroke} strokeWidth="3" />
      <circle cx="24" cy="28" r="2.5" fill={stroke} />
      <circle cx="40" cy="28" r="2.5" fill={stroke} />
      {/* sad mouth */}
      <path
        d="M22 44c3.5-5 16.5-5 20 0"
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

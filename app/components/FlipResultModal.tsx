'use client';

import * as React from 'react';
import { Button, Pill, Hint } from './ui';

export default function ResultModal(props: {
  open: boolean;
  onClose: () => void;

  didWin: boolean;

  roundId?: string;
  winner?: string;
  resolveSig?: string;

  short?: (pk?: string) => string;
}) {
  const { open, onClose, didWin, roundId, winner, resolveSig, short } = props;

  const [animateKey, setAnimateKey] = React.useState(0);

  React.useEffect(() => {
    if (open) setAnimateKey((k) => k + 1);
  }, [open]);

  if (!open) return null;

  const ringHover =
    'hover:shadow-[0_0_0_1px_rgba(168,85,247,0.70),0_0_0_4px_rgba(168,85,247,0.18),0_18px_60px_rgba(0,0,0,0.45)]';

  const title = didWin ? 'You won' : 'You lost';
  const subtitle = didWin ? 'Payout sent from treasury.' : 'Better luck next time.';
  const pillTone = didWin ? 'green' : 'purple';

  // WIN = Solana front (0deg mod 360)
  // LOSE = Sad back (180deg mod 360)
  const endRot = didWin ? '1080deg' : '900deg';

  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-[0_30px_140px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6">
          <div className="absolute inset-0 bg-[radial-gradient(700px_120px_at_20%_0%,rgba(168,85,247,0.22),transparent_60%),radial-gradient(700px_120px_at_80%_0%,rgba(34,197,94,0.14),transparent_60%)]" />

          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-lg font-semibold">{title}</div>
                <Pill tone={pillTone as any}>{didWin ? 'win' : 'loss'}</Pill>
              </div>

              <Hint className="mt-2">
                {subtitle}
                {roundId && (
                  <>
                    <span className="text-zinc-600"> · </span>
                    Flip ID: <span className="text-zinc-300">{roundId}</span>
                  </>
                )}
                {winner && (
                  <>
                    <span className="text-zinc-600"> · </span>
                    Winner{' '}
                    <span className="font-mono text-zinc-300">
                      {short ? short(winner) : winner}
                    </span>
                  </>
                )}
              </Hint>
            </div>

            <Button variant="ghost" onClick={onClose} className={ringHover}>
              Close
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 pt-0">
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            {/* Coin */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Result</div>

              <div className="mt-4 grid place-items-center">
                <div className="coin-wrap">
                  <div
                    key={animateKey}
                    className="coin"
                    style={{ ['--end-rot' as any]: endRot } as React.CSSProperties}
                  >
                    <div className="coin-face coin-front">
                      <SolanaMark />
                    </div>
                    <div className="coin-face coin-back">
                      <SadFace />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 text-center text-xs text-zinc-500">
                {didWin ? 'Landed on Solana' : 'Landed on Sad face'}
              </div>
            </div>

            {/* Tx */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Transaction</div>

              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-zinc-500">Resolve signature</div>
                <div className="mt-1 break-all font-mono text-xs text-zinc-200">
                  {resolveSig || '—'}
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button onClick={onClose} className={ringHover + ' min-w-[160px]'}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>

        <style jsx>{`
          .coin-wrap {
            perspective: 1200px;
          }

          .coin {
            width: 110px;
            height: 110px;
            position: relative;
            transform-style: preserve-3d;
            border-radius: 999px;
            background: rgba(10, 10, 12, 1);
            box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
            animation: settle 1.3s cubic-bezier(0.18, 0.85, 0.22, 1) forwards;
          }

          .coin-face {
            position: absolute;
            inset: 0;
            display: grid;
            place-items: center;
            border-radius: 999px;

            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;

            background: rgba(15, 15, 18, 1);
          }

          .coin-front {
            transform: rotateY(0deg);
          }

          .coin-back {
            transform: rotateY(180deg);
          }

          .solana,
          .sad {
            position: relative;
            z-index: 2;
            width: 64px;
            height: 64px;
            filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.55));
          }

          @keyframes settle {
            0% {
              transform: rotateY(0deg);
            }
            100% {
              transform: rotateY(var(--end-rot));
            }
          }
        `}</style>
      </div>
    </div>
  );
}

function SolanaMark() {
  return (
    <svg viewBox="0 0 256 256" className="solana">
      <defs>
        <linearGradient id="solg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(168,85,247)" />
          <stop offset="0.55" stopColor="rgb(59,130,246)" />
          <stop offset="1" stopColor="rgb(34,197,94)" />
        </linearGradient>
      </defs>

      <path d="M54 78h148l-20 20H34z" fill="url(#solg)" />
      <path d="M54 122h148l-20 20H34z" fill="url(#solg)" opacity="0.9" />
      <path d="M54 166h148l-20 20H34z" fill="url(#solg)" opacity="0.8" />
    </svg>
  );
}

function SadFace() {
  const stroke = 'rgba(168,85,247,0.95)';
  const fill = 'rgba(168,85,247,0.18)';

  return (
    <svg viewBox="0 0 64 64" className="sad">
      <circle cx="32" cy="32" r="22" fill={fill} stroke={stroke} strokeWidth="3" />
      <circle cx="24" cy="28" r="2.5" fill={stroke} />
      <circle cx="40" cy="28" r="2.5" fill={stroke} />
      <path d="M22 44c4-6 16-6 20 0" stroke={stroke} strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

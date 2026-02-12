'use client';

import React from 'react';
import { Button, Card, Pill } from './Card';
import { Amount, fmtSol } from './Amounts';
import type { FlipRound } from './LobbyCard';

function short(pk?: string) {
  if (!pk) return '—';
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

export default function ActiveRoundCard({
  round,
  connectedPk,
  treasuryLamports,
  minBufferLamports,
  betLamports,
  feeLamports,
  potLamports,
  payoutLamports,
  canResolve,
  resolving,
  onResolve,
  onLeave,
  leaveEnabled,
}: {
  round: FlipRound | null;
  connectedPk?: string | null;
  treasuryLamports: number | null;
  minBufferLamports: number;
  betLamports: number;
  feeLamports: number;
  potLamports: number;
  payoutLamports: number;
  canResolve: boolean;
  resolving: boolean;
  onResolve: () => void;
  onLeave: () => void;
  leaveEnabled: boolean;
}) {
  const statusTone = round?.status === 'created' ? 'warn' : round?.status === 'joined' ? 'accent' : 'good';

  return (
    <Card
      title="Active round"
      right={
        round ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Pill label={`Status: ${round.status}`} tone={statusTone as any} />
            <Pill label={`Bet: ${fmtSol(round.betSol, 2)}`} tone="muted" />
          </div>
        ) : (
          <Pill label="No round loaded" tone="muted" />
        )
      }
    >
      {!round && (
        <div className="mono" style={{ opacity: 0.75 }}>
          Create a flip or join one from the lobby.
        </div>
      )}

      {round && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div
            style={{
              display: 'grid',
              gap: 8,
              border: '1px solid var(--stroke)',
              borderRadius: 14,
              padding: 12,
              background: 'rgba(255,255,255,.02)',
            }}
          >
            <Meta label="FlipId" value={<span className="mono">{round.id}</span>} />
            <Meta label="Creator" value={<span className="mono">{short(round.creator)}</span>} />
            <Meta label="Joiner" value={<span className="mono">{round.joiner ? short(round.joiner) : '—'}</span>} />
            {round.winner && <Meta label="Winner" value={<span className="mono">{short(round.winner)}</span>} />}
          </div>

          <div
            style={{
              display: 'grid',
              gap: 8,
              border: '1px solid var(--stroke)',
              borderRadius: 14,
              padding: 12,
              background: 'rgba(255,255,255,.02)',
            }}
          >
            <Row label="Bet" right={<Amount lamports={betLamports} strong />} />
            <Row label="Fee (3% join fee model)" right={<Amount lamports={feeLamports} />} />
            <Row label="Pot" right={<Amount lamports={potLamports} strong />} />
            <Row label="Winner payout" right={<Amount lamports={payoutLamports} strong />} />

            <div style={{ height: 1, background: 'var(--stroke)', margin: '6px 0' }} />

            <Row label="Treasury/Pot balance" right={treasuryLamports === null ? <div>…</div> : <Amount lamports={treasuryLamports} />} />
            <Row label="Safety buffer" right={<Amount lamports={minBufferLamports} />} />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button tone="primary" onClick={onResolve} disabled={!canResolve || resolving} style={{ minWidth: 210 }}>
              {resolving ? 'Resolving…' : 'Resolve (treasury wallet)'}
            </Button>

            <Button tone="danger" onClick={onLeave} disabled={!leaveEnabled} style={{ minWidth: 210 }}>
              Leave (refund 97%)
            </Button>

            {round.status === 'created' && (
              <div className="mono" style={{ opacity: 0.75, alignSelf: 'center' }}>
                Waiting for opponent…
              </div>
            )}
          </div>

          {!canResolve && round.status === 'joined' && (
            <div className="mono" style={{ opacity: 0.75 }}>
              Resolve requires: <b>status = joined</b> and <b>treasury ≥ pot + buffer</b>.
            </div>
          )}

          {/* tiny coin visual */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Coin spinning={round.status === 'joined'} />
          </div>
        </div>
      )}
    </Card>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
      <div style={{ opacity: 0.75 }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

function Row({ label, right }: { label: string; right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
      <div style={{ opacity: 0.85 }}>{label}</div>
      {right}
    </div>
  );
}

function Coin({ spinning }: { spinning: boolean }) {
  return (
    <div
      style={{
        width: 54,
        height: 54,
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,.15)',
        background:
          'radial-gradient(circle at 30% 30%, rgba(255,255,255,.25), rgba(255,255,255,.05) 45%, rgba(124,58,237,.10) 70%, rgba(0,0,0,.0))',
        boxShadow: '0 10px 28px rgba(0,0,0,.45)',
        transformStyle: 'preserve-3d',
        animation: spinning ? 'flipSpin 1.05s linear infinite' : undefined,
      }}
      title={spinning ? 'Flipping…' : 'Coin'}
    />
  );
}

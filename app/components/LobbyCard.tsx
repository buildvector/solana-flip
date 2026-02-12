'use client';

import { Card, Button, Pill, Label, Hint, Mono } from './ui';

export type FlipStatus = 'created' | 'joined' | 'resolved';

export type Reservation = {
  token: string;
  joiner: string;
  expiresAt: number;
};

export type FlipRound = {
  id: string;
  createdAt: number;
  betSol: number;
  creator: string;
  joiner?: string;
  status: FlipStatus;
  winner?: string;
  resolveSig?: string;
  reservation?: Reservation;
};

export default function LobbyCard(props: {
  round: FlipRound;
  joining: boolean;
  canJoin: boolean;
  onJoin: () => void;
}) {
  const { round: r, joining, canJoin, onJoin } = props;

  const reserved = !!r?.reservation?.token;
  const bet = Number(r?.betSol ?? 0);

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-lg font-semibold tracking-tight">{bet.toFixed(2)} SOL</div>
            <Pill>{String(r.status || 'created')}</Pill>
            {reserved ? <Pill tone="purple">reserved</Pill> : <Pill tone="green">open</Pill>}
          </div>

          <Hint className="mt-2">
            Flip ID: <span className="text-zinc-300">{r.id}</span>
          </Hint>

          <div className="mt-2 grid gap-1 text-xs text-zinc-400">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="!text-zinc-500">Creator</Label>
              <Mono className="text-xs text-zinc-200">{short(r.creator)}</Mono>
            </div>

            {r?.reservation?.joiner ? (
              <div className="flex flex-wrap items-center gap-2">
                <Label className="!text-zinc-500">Lock</Label>
                <Mono className="text-xs text-zinc-200">{short(r.reservation.joiner)}</Mono>
                <span className="text-zinc-500">·</span>
                <span className="text-zinc-500">30s seat hold</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          <Button variant="primary" disabled={!canJoin || joining} onClick={onJoin} className="min-w-[120px]">
            {joining ? 'Joining…' : 'Join'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function short(pk?: string) {
  if (!pk) return '—';
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

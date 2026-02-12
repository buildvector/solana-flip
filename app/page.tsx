'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';

import CreateCard from './components/CreateCard';
import LobbyCard from './components/LobbyCard';
import PreflightModal from './components/PreflightModal';
import FlipResultModal from './components/FlipResultModal';
import { Button, Card } from './components/ui';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

const TREASURY_POT = new PublicKey('27iNJT6mni2fRuu1knivYgYHcAhicwW6WjXTZqffQBAG');
const BET_OPTIONS_SOL = [0.1, 0.25, 0.5, 1] as const;

type FlipStatus = 'created' | 'joined' | 'resolved';

type FlipRound = {
  id: string;
  createdAt: number;
  betSol: number;
  creator: string;
  joiner?: string;
  status: FlipStatus;
  winner?: string;
  resolveSig?: string;
  // (kan komme fra API – skader ikke hvis undefined)
  signature?: string;
  joinSig?: string;
  reservation?: { token: string; joiner: string; expiresAt: number };
};

type Proof = {
  winner: string;
  winnerSide: 'CREATOR' | 'JOINER';
  randomnessHashHex: string;
};

async function api(action: string, payload: Record<string, any>) {
  const res = await fetch('/api/rounds', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `API error (${res.status})`);
  return json as any;
}

function short(pk?: string) {
  if (!pk) return '—';
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function txUrl(sig: string) {
  // mainnet solscan
  return `https://solscan.io/tx/${sig}`;
}

/** ---- localStorage helpers (per wallet) ---- */
function keyShown(pk: string) {
  return `solflip:shown:${pk}`;
}
function keyPending(pk: string) {
  return `solflip:pendingCreated:${pk}`;
}

function safeReadSet(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function safeWriteSet(storageKey: string, s: Set<string>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(Array.from(s)));
  } catch {
    // ignore
  }
}

export default function Page() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [betSol, setBetSol] = useState<number>(0.1);

  const [lobby, setLobby] = useState<FlipRound[]>([]);
  const [lobbyLoading, setLobbyLoading] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightRound, setPreflightRound] = useState<FlipRound | null>(null);
  const [preflightToken, setPreflightToken] = useState<string | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightTxSig, setPreflightTxSig] = useState<string | null>(null);

  // Result modal
  const [resultOpen, setResultOpen] = useState(false);
  const [resultOutcome, setResultOutcome] = useState<'win' | 'lose'>('lose');
  const [resultRoundId, setResultRoundId] = useState<string | undefined>(undefined);
  const [resultWinner, setResultWinner] = useState<string | undefined>(undefined);
  const [resultResolveSig, setResultResolveSig] = useState<string | undefined>(undefined);

  // History panel
  const [history, setHistory] = useState<FlipRound[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Queue results so we can show multiple “missed” results one by one
  const resultQueueRef = useRef<FlipRound[]>([]);
  const pumpingQueueRef = useRef(false);

  // These are “in-memory” but we also persist them per wallet
  const shownResultsRef = useRef<Set<string>>(new Set());
  const pendingCreatedRef = useRef<Set<string>>(new Set());

  const depositFeeBps = 300;
  const WALLET_BUFFER = Math.round(0.005 * LAMPORTS_PER_SOL);

  const betLamports = useMemo(() => Math.round(betSol * LAMPORTS_PER_SOL), [betSol]);
  const feeLamports = useMemo(
    () => Math.max(1, Math.floor((betLamports * depositFeeBps) / 10_000)),
    [betLamports]
  );
  const potLamports = useMemo(() => Math.max(0, betLamports - feeLamports), [betLamports, feeLamports]);

  const preBetLamports = useMemo(
    () => (preflightRound ? Math.round(Number(preflightRound.betSol) * LAMPORTS_PER_SOL) : 0),
    [preflightRound]
  );
  const preFeeLamports = useMemo(() => Math.max(1, Math.floor((preBetLamports * depositFeeBps) / 10_000)), [
    preBetLamports,
    depositFeeBps,
  ]);
  const prePotLamports = useMemo(() => Math.max(0, preBetLamports - preFeeLamports), [preBetLamports, preFeeLamports]);

  const canPlay = !!publicKey && !publicKey.equals(TREASURY_POT);

  const refreshLobby = async (quiet = false) => {
    try {
      if (!quiet) setLobbyLoading(true);
      const { rounds } = await api('list', { only: 'created', limit: 50 });
      setLobby(rounds ?? []);
    } catch {
      // ignore
    } finally {
      if (!quiet) setLobbyLoading(false);
    }
  };

  const refreshHistory = async (quiet = false) => {
    if (!publicKey) {
      setHistory([]);
      return;
    }

    const me = publicKey.toBase58();
    try {
      if (!quiet) setHistoryLoading(true);

      // hent “alt” (op til 80) og filtrér lokalt
      const res = await api('list', { limit: 50 }).catch(() => null);
      const rounds: FlipRound[] = res?.rounds ?? [];

      const mine = rounds
        .filter((r) => r.creator === me || r.joiner === me)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, 10);

      setHistory(mine);
    } finally {
      if (!quiet) setHistoryLoading(false);
    }
  };

  const ensureResolved = async (id: string) => {
    for (let i = 0; i < 10; i++) {
      const res = await api('tryResolve', { id }).catch(() => null);
      if (res?.round?.status === 'resolved') return res as { round: FlipRound; proof?: Proof };
      await sleep(700);
    }
    return null;
  };

  const enqueueResult = (r: FlipRound) => {
    if (shownResultsRef.current.has(r.id)) return;
    if (resultQueueRef.current.some((x) => x.id === r.id)) return;
    resultQueueRef.current.push(r);
  };

  const pumpQueue = async () => {
    if (!publicKey) return;
    if (pumpingQueueRef.current) return;
    if (resultOpen) return;

    pumpingQueueRef.current = true;
    try {
      while (!resultOpen && resultQueueRef.current.length > 0) {
        const r = resultQueueRef.current.shift()!;
        if (shownResultsRef.current.has(r.id)) continue;

        const me = publicKey.toBase58();
        const winner = r.winner || '';
        const didWin = winner === me;

        shownResultsRef.current.add(r.id);
        safeWriteSet(keyShown(me), shownResultsRef.current);

        if (pendingCreatedRef.current.has(r.id)) {
          pendingCreatedRef.current.delete(r.id);
          safeWriteSet(keyPending(me), pendingCreatedRef.current);
        }

        setResultOutcome(didWin ? 'win' : 'lose');
        setResultRoundId(r.id);
        setResultWinner(winner);
        setResultResolveSig(r.resolveSig ?? undefined);
        setResultOpen(true);
        return;
      }
    } finally {
      pumpingQueueRef.current = false;
    }
  };

  const closeResult = () => setResultOpen(false);

  useEffect(() => {
    if (!publicKey) return;
    if (!resultOpen) {
      const t = setTimeout(() => {
        pumpQueue();
        refreshHistory(true);
      }, 250);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultOpen, publicKey]);

  // polling open flips
  useEffect(() => {
    refreshLobby(true);
    const id = setInterval(() => refreshLobby(true), 3500);
    return () => clearInterval(id);
  }, []);

  // hydrate persisted sets on wallet change + refresh history
  useEffect(() => {
    if (!publicKey) return;
    const me = publicKey.toBase58();

    shownResultsRef.current = safeReadSet(keyShown(me));
    pendingCreatedRef.current = safeReadSet(keyPending(me));

    refreshHistory(true);
    pumpQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey]);

  // background checker: pending created + scan resolved for “missed”
  useEffect(() => {
    if (!publicKey) return;
    const me = publicKey.toBase58();

    const tick = async () => {
      // 1) pending created
      const pending = Array.from(pendingCreatedRef.current);
      for (const id of pending.slice(0, 8)) {
        const get = await api('get', { id }).catch(() => null);
        const r: FlipRound | null = get?.round ?? null;
        if (!r) continue;

        if (r.status === 'joined') {
          const resolved = await ensureResolved(r.id);
          if (resolved?.round?.status === 'resolved') enqueueResult(resolved.round);
        }
        if (r.status === 'resolved') enqueueResult(r);
      }

      // 2) scan resolved list for me
      const res = await api('list', { limit: 50 }).catch(() => null);
      const rounds: FlipRound[] = res?.rounds ?? [];

      for (const r of rounds) {
        if (shownResultsRef.current.has(r.id)) continue;
        if (r.creator !== me && r.joiner !== me) continue;
        if (r.status !== 'resolved') continue;
        enqueueResult(r);
      }

      pumpQueue();
      refreshHistory(true);
    };

    tick();
    const id = setInterval(tick, 2500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey]);

  const onCreateFlip = async () => {
    if (!publicKey || !connected) return;

    const bal = await connection.getBalance(publicKey);
    const required = betLamports + WALLET_BUFFER;
    if (bal < required) {
      alert(`Insufficient balance.\nNeed about ${(required / LAMPORTS_PER_SOL).toFixed(4)} SOL (bet + buffer).`);
      return;
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: TREASURY_POT,
        lamports: betLamports,
      })
    );

    const sig = await sendTransaction(tx, connection);

    const created = await api('create', {
      betSol,
      creator: publicKey.toBase58(),
      signature: sig,
    });

    const id = created?.round?.id as string | undefined;
    if (id) {
      const me = publicKey.toBase58();
      pendingCreatedRef.current.add(id);
      safeWriteSet(keyPending(me), pendingCreatedRef.current);
    }

    await refreshLobby(true);
    await refreshHistory(true);
  };

  const onJoin = async (id: string) => {
    if (!publicKey) return;

    setJoiningId(id);
    try {
      const get = await api('get', { id });
      const reserve = await api('reserveJoin', { id, joiner: publicKey.toBase58() });

      setPreflightRound(get.round);
      setPreflightToken(reserve?.reservation?.token || null);
      setPreflightTxSig(null);
      setPreflightOpen(true);
    } finally {
      setJoiningId(null);
    }
  };

  const onConfirmJoin = async () => {
    if (!preflightRound || !preflightToken || !publicKey) return;

    const lamports = Math.round(preflightRound.betSol * LAMPORTS_PER_SOL);

    const bal = await connection.getBalance(publicKey);
    const required = lamports + WALLET_BUFFER;
    if (bal < required) {
      alert(`Insufficient balance.\nNeed about ${(required / LAMPORTS_PER_SOL).toFixed(4)} SOL (bet + buffer).`);
      return;
    }

    setPreflightBusy(true);
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: TREASURY_POT,
          lamports,
        })
      );

      const sig = await sendTransaction(tx, connection);
      setPreflightTxSig(sig);

      const joined = await api('join', {
        id: preflightRound.id,
        joiner: publicKey.toBase58(),
        reservationToken: preflightToken,
        signature: sig,
      });

      setPreflightOpen(false);

      const resolved = await ensureResolved(preflightRound.id);
      const finalRound: FlipRound | null = resolved?.round ?? joined?.round ?? null;
      if (finalRound?.status === 'resolved') {
        enqueueResult(finalRound);
        pumpQueue();
      }

      await refreshLobby(true);
      await refreshHistory(true);
    } finally {
      setPreflightBusy(false);
    }
  };

  return (
    <main className="bg-casino min-h-screen text-zinc-100">
      <div className="casino-wrap mx-auto max-w-5xl px-4 py-14">
        <div className="flex flex-col gap-4">
          <div className="text-3xl font-semibold">Solana Flip</div>
          <div className="text-sm text-zinc-400 max-w-lg">
            Minimal P2P coinflip. Both players deposit to the same pot. Winner resolved server-side.
          </div>
          <div className="inline-flex">
            <WalletMultiButton />
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="grid gap-6">
            <CreateCard
              betOptions={BET_OPTIONS_SOL}
              betSol={betSol}
              setBetSol={setBetSol}
              feeLamports={feeLamports}
              potLamports={potLamports}
              depositFeeBps={depositFeeBps}
              onCreate={onCreateFlip}
              disableCreate={!canPlay}
            />

            {/* HISTORY PANEL */}
            <Card className="p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">History</div>
                  <div className="mt-1 text-xs text-zinc-400">Your latest 10 flips (creator or joiner).</div>
                </div>

                <Button variant="ghost" onClick={() => refreshHistory(false)} disabled={historyLoading || !publicKey}>
                  {historyLoading ? 'Refreshing…' : 'Refresh'}
                </Button>
              </div>

              <div className="mt-4 grid gap-2">
                {!publicKey && <div className="text-sm text-zinc-500">Connect a wallet to see history.</div>}

                {publicKey && history.length === 0 && !historyLoading && (
                  <div className="text-sm text-zinc-500">No flips yet.</div>
                )}

                {history.map((r) => {
                  const me = publicKey?.toBase58();
                  const isMine = me && (r.creator === me || r.joiner === me);
                  const isResolved = r.status === 'resolved';
                  const didWin = isResolved && !!me && (r.winner ?? '') === me;

                  const statusBadge =
                    r.status === 'created'
                      ? 'open'
                      : r.status === 'joined'
                        ? 'joined'
                        : r.status === 'resolved'
                          ? 'resolved'
                          : r.status;

                  const statusTone =
                    r.status === 'created'
                      ? 'bg-white/5 text-zinc-200 border-white/10'
                      : r.status === 'joined'
                        ? 'bg-white/5 text-zinc-200 border-white/10'
                        : didWin
                          ? 'bg-[rgba(34,197,94,0.12)] text-[rgba(34,197,94,0.95)] border-[rgba(34,197,94,0.25)]'
                          : 'bg-[rgba(168,85,247,0.12)] text-[rgba(168,85,247,0.95)] border-[rgba(168,85,247,0.25)]';

                  return (
                    <div
                      key={r.id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold">{Number(r.betSol || 0).toFixed(2)} SOL</div>

                          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${statusTone}`}>
                            {isResolved ? (didWin ? 'win' : 'loss') : statusBadge}
                          </span>

                          {isResolved && r.winner ? (
                            <span className="text-[11px] text-zinc-400">
                              winner <span className="font-mono text-zinc-200">{short(r.winner)}</span>
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-1 text-xs text-zinc-500">
                          Flip ID <span className="font-mono text-zinc-300">{r.id}</span>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {r.resolveSig ? (
                          <a
                            href={txUrl(r.resolveSig)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-zinc-300 underline decoration-white/20 hover:decoration-white/50"
                          >
                            View tx
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-600">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* OPEN FLIPS */}
          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Open flips</div>
                <div className="mt-1 text-xs text-zinc-400">Join an open flip. Deposit goes to the pot.</div>
              </div>

              <Button variant="ghost" onClick={() => refreshLobby(false)} disabled={lobbyLoading}>
                {lobbyLoading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>

            <div className="mt-4 grid gap-3">
              {!lobbyLoading && lobby.length === 0 && <div className="text-sm text-zinc-500">No open flips.</div>}

              {lobby.map((r) => (
                <LobbyCard
                  key={r.id}
                  round={r}
                  joining={joiningId === r.id}
                  canJoin={canPlay}
                  onJoin={() => onJoin(r.id)}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>

      <PreflightModal
        open={preflightOpen}
        busy={preflightBusy}
        round={preflightRound}
        reservationToken={preflightToken}
        txSig={preflightTxSig}
        depositFeeBps={depositFeeBps}
        preFeeLamports={preFeeLamports}
        prePotLamports={prePotLamports}
        short={short}
        onCancel={() => setPreflightOpen(false)}
        onConfirm={onConfirmJoin}
      />

      <FlipResultModal
        open={resultOpen}
        onClose={closeResult}
        didWin={resultOutcome === 'win'}
        roundId={resultRoundId}
        winner={resultWinner}
        resolveSig={resultResolveSig}
        short={short}
      />
    </main>
  );
}

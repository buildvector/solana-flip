// app/api/rounds/route.ts
import { NextResponse } from 'next/server';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import crypto from 'crypto';

export const runtime = 'nodejs';

type FlipStatus = 'created' | 'joined' | 'resolved';

type Reservation = {
  token: string;
  joiner: string;
  expiresAt: number;
};

type FlipRound = {
  id: string;
  createdAt: number;
  betSol: number;
  creator: string;
  joiner?: string;
  status: FlipStatus;
  winner?: string;
  signature?: string; // creator deposit sig
  joinSig?: string; // joiner deposit sig
  resolveSig?: string; // payout sig (server)
  reservation?: Reservation;

  // 👇 debug fields (safe to expose)
  lastResolve?: {
    at: number;
    ok: boolean;
    reason?: string;
    error?: string;
    treasuryBalLamports?: number;
    requiredLamports?: number;
    totalPayoutLamports?: number;
  };
};

type Store = {
  rounds: Map<string, FlipRound>;
  usedSigs: Set<string>;
};

const STORE_KEY = '__SOLANA_FLIP_STORE__';

function store(): Store {
  // @ts-expect-error global
  if (!globalThis[STORE_KEY]) {
    // @ts-expect-error global
    globalThis[STORE_KEY] = {
      rounds: new Map<string, FlipRound>(),
      usedSigs: new Set<string>(),
    } as Store;
  }
  // @ts-expect-error global
  return globalThis[STORE_KEY] as Store;
}

function makeId(prefix = 'mle') {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function now() {
  return Date.now();
}

function jsonOk(data: any) {
  return NextResponse.json(data, { status: 200 });
}

function jsonErr(error: string, status = 400, extra?: any) {
  return NextResponse.json({ error, ...(extra || {}) }, { status });
}

// --- CONFIG ---
const PLAY_FEE_BPS = 300; // 3% fee on each deposit (create + join)
const HOUSE_EDGE_BPS = 0; // 0% (pure p2p)
const MIN_TREASURY_BUFFER_LAMPORTS = Math.round(0.001 * LAMPORTS_PER_SOL);
const RESERVATION_MS = 30_000;

// RPC
function getRpcUrl() {
  return process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
}

function getTreasuryKeypair(): Keypair {
  const raw = process.env.TREASURY_SECRET_KEY;
  if (!raw) {
    throw new Error(
      'Missing TREASURY_SECRET_KEY in .env.local (server-only). Expected JSON array like [12,34,...]'
    );
  }

  let arr: number[];
  try {
    arr = JSON.parse(raw);
  } catch {
    throw new Error('TREASURY_SECRET_KEY must be a JSON array (exported keypair), e.g. [12,34,...]');
  }

  if (!Array.isArray(arr) || arr.length !== 64) {
    throw new Error('TREASURY_SECRET_KEY JSON array invalid. Expected 64 numbers.');
  }

  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

function computeSplits(betSol: number) {
  const betLamports = Math.round(betSol * LAMPORTS_PER_SOL);

  const feeLamports = Math.max(1, Math.floor((betLamports * PLAY_FEE_BPS) / 10_000));
  const potLamports = betLamports - feeLamports;

  const edgeLamports =
    HOUSE_EDGE_BPS > 0 ? Math.max(1, Math.floor((potLamports * HOUSE_EDGE_BPS) / 10_000)) : 0;

  const payoutLamports = potLamports - edgeLamports;

  return { betLamports, feeLamports, potLamports, edgeLamports, payoutLamports };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll for parsed tx since RPC often returns null right after signature is returned.
 */
async function waitForParsedTx(connection: Connection, sig: string, attempts = 12, delayMs = 700) {
  try {
    await connection.confirmTransaction(sig, 'confirmed');
  } catch {
    // ignore; we retry lookup anyway
  }

  for (let i = 0; i < attempts; i++) {
    const tx = await connection.getParsedTransaction(sig, {
      maxSupportedTransactionVersion: 0,
    });
    if (tx) return tx;
    await sleep(delayMs);
  }

  return null;
}

/**
 * Validate that `sig` includes a SystemProgram.transfer:
 *   from = expectedFrom
 *   to   = expectedTo
 *   lamports >= expectedLamports
 */
async function assertDepositSig(params: {
  connection: Connection;
  sig: string;
  expectedFrom: PublicKey;
  expectedTo: PublicKey;
  expectedLamports: number;
}) {
  const { connection, sig, expectedFrom, expectedTo, expectedLamports } = params;

  const tx = await waitForParsedTx(connection, sig);

  if (!tx) throw new Error('Deposit tx not found/confirmed yet. Try again in a moment.');
  if (tx.meta?.err) throw new Error('Deposit tx failed on-chain.');

  const ix = tx.transaction.message.instructions;

  const ok = ix.some((i: any) => {
    if (i?.program !== 'system') return false;
    if (i?.parsed?.type !== 'transfer') return false;

    const info = i.parsed.info;
    const from = String(info?.source || '');
    const to = String(info?.destination || '');
    const lamports = Number(info?.lamports || 0);

    return (
      from === expectedFrom.toBase58() &&
      to === expectedTo.toBase58() &&
      Number.isFinite(lamports) &&
      lamports >= expectedLamports
    );
  });

  if (!ok) throw new Error('Deposit validation failed: expected transfer not found in signature.');
}

/**
 * ✅ Provable winner selection:
 * winner = sha256(createSig + ":" + joinSig)
 * lastByte % 2 => 0 = creator, 1 = joiner
 */
function pickWinnerDeterministic(params: {
  createSig: string;
  joinSig: string;
  creator: string;
  joiner: string;
}) {
  const { createSig, joinSig, creator, joiner } = params;

  const input = `${createSig}:${joinSig}`;
  const hash = crypto.createHash('sha256').update(input).digest();
  const lastByte = hash[hash.length - 1] ?? 0;
  const bit = lastByte % 2;

  const winner = bit === 0 ? creator : joiner;
  const winnerSide = bit === 0 ? 'CREATOR' : 'JOINER';

  return {
    winner,
    winnerSide,
    randomnessHashHex: hash.toString('hex'),
  };
}

/**
 * Server-side resolve (P2P):
 * payout winner from TREASURY_POT.
 * Winner payout = (bet - fee) * 2
 */
async function tryResolve(roundId: string): Promise<{ round: FlipRound; didResolve: boolean }> {
  const s = store();
  const r = s.rounds.get(roundId);
  if (!r) throw new Error('Round not found');

  if (r.status !== 'joined') return { round: r, didResolve: false };
  if (!r.creator || !r.joiner || !r.signature || !r.joinSig) return { round: r, didResolve: false };

  const treasuryKp = getTreasuryKeypair();
  const TREASURY_POT = treasuryKp.publicKey;
  const connection = new Connection(getRpcUrl(), 'confirmed');

  const { potLamports } = computeSplits(r.betSol);
  const totalPayoutLamports = potLamports * 2;

  const bal = await connection.getBalance(TREASURY_POT);
  const required = totalPayoutLamports + MIN_TREASURY_BUFFER_LAMPORTS;

  // Not enough treasury balance to pay (should be rare, but possible if pot address mismatch)
  if (bal < required) {
    const updated: FlipRound = {
      ...r,
      lastResolve: {
        at: now(),
        ok: false,
        reason: 'INSUFFICIENT_TREASURY_BALANCE',
        treasuryBalLamports: bal,
        requiredLamports: required,
        totalPayoutLamports,
      },
    };
    s.rounds.set(roundId, updated);
    return { round: updated, didResolve: false };
  }

  // ✅ Deterministic winner
  const picked = pickWinnerDeterministic({
    createSig: r.signature,
    joinSig: r.joinSig,
    creator: r.creator,
    joiner: r.joiner,
  });

  const winnerPk = new PublicKey(picked.winner);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: TREASURY_POT,
      toPubkey: winnerPk,
      lamports: totalPayoutLamports,
    })
  );

  // If this throws, we want the exact reason stored & returned
  try {
    const sig = await connection.sendTransaction(tx, [treasuryKp], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    await connection.confirmTransaction(sig, 'confirmed');

    const resolved: FlipRound = {
      ...r,
      status: 'resolved',
      winner: winnerPk.toBase58(),
      resolveSig: sig,
      lastResolve: {
        at: now(),
        ok: true,
        totalPayoutLamports,
      },
    };

    s.rounds.set(roundId, resolved);
    return { round: resolved, didResolve: true };
  } catch (e: any) {
    const updated: FlipRound = {
      ...r,
      lastResolve: {
        at: now(),
        ok: false,
        reason: 'PAYOUT_TX_FAILED',
        error: e?.message ?? String(e),
        treasuryBalLamports: bal,
        requiredLamports: required,
        totalPayoutLamports,
      },
    };
    s.rounds.set(roundId, updated);
    return { round: updated, didResolve: false };
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const action = String(body?.action || '');

    const s = store();

    // IMPORTANT: server treasury/pot is derived from TREASURY_SECRET_KEY
    const treasuryKp = getTreasuryKeypair();
    const TREASURY_POT = treasuryKp.publicKey;
    const connection = new Connection(getRpcUrl(), 'confirmed');

    // quick helper for debugging / syncing UI
    if (action === 'config') {
      return jsonOk({
        rpc: getRpcUrl(),
        treasuryPot: TREASURY_POT.toBase58(),
        playFeeBps: PLAY_FEE_BPS,
        bufferLamports: MIN_TREASURY_BUFFER_LAMPORTS,
      });
    }

    if (action === 'create') {
      const betSol = Number(body?.betSol);
      const creator = String(body?.creator || '').trim();
      const sig = String(body?.signature || '').trim();

      if (!Number.isFinite(betSol) || betSol <= 0) return jsonErr('Invalid betSol');
      if (!creator) return jsonErr('Missing creator');
      if (!sig) return jsonErr('Missing signature');
      if (s.usedSigs.has(sig)) return jsonErr('Signature already used', 409);

      const { betLamports } = computeSplits(betSol);

      await assertDepositSig({
        connection,
        sig,
        expectedFrom: new PublicKey(creator),
        expectedTo: TREASURY_POT,
        expectedLamports: betLamports,
      });

      s.usedSigs.add(sig);

      const round: FlipRound = {
        id: makeId('mle'),
        createdAt: now(),
        betSol,
        creator,
        status: 'created',
        signature: sig,
      };

      s.rounds.set(round.id, round);
      return jsonOk({ round });
    }

    if (action === 'get') {
      const id = String(body?.id || '').trim();
      if (!id) return jsonErr('Missing id');

      const round = s.rounds.get(id);
      if (!round) return jsonErr('Not found', 404);

      if (round.reservation && round.reservation.expiresAt <= now()) {
        const cleaned = { ...round };
        delete cleaned.reservation;
        s.rounds.set(id, cleaned);
        return jsonOk({ round: cleaned });
      }

      return jsonOk({ round });
    }

    if (action === 'list') {
      const only = String(body?.only || '').trim();
      const limit = Math.max(1, Math.min(50, Number(body?.limit || 20)));

      let rounds = Array.from(s.rounds.values());

      const t = now();
      rounds = rounds.map((r) => {
        if (r.reservation && r.reservation.expiresAt <= t) {
          const cleaned = { ...r };
          delete cleaned.reservation;
          s.rounds.set(r.id, cleaned);
          return cleaned;
        }
        return r;
      });

      if (only) rounds = rounds.filter((r) => r.status === only);
      rounds.sort((a, b) => b.createdAt - a.createdAt);

      return jsonOk({ rounds: rounds.slice(0, limit) });
    }

    if (action === 'reserveJoin') {
      const id = String(body?.id || '').trim();
      const joiner = String(body?.joiner || '').trim();

      if (!id) return jsonErr('Missing id');
      if (!joiner) return jsonErr('Missing joiner');

      const round = s.rounds.get(id);
      if (!round) return jsonErr('Not found', 404);
      if (round.status !== 'created') return jsonErr(`Cannot reserve. Status=${round.status}`);

      if (round.reservation && round.reservation.expiresAt > now()) {
        return jsonErr('Already reserved', 409, { reservation: round.reservation });
      }

      const reservation: Reservation = {
        token: makeId('rsv'),
        joiner,
        expiresAt: now() + RESERVATION_MS,
      };

      const updated: FlipRound = { ...round, reservation };
      s.rounds.set(id, updated);

      return jsonOk({ reservation, round: updated });
    }

    if (action === 'join') {
      const id = String(body?.id || '').trim();
      const joiner = String(body?.joiner || '').trim();
      const reservationToken = String(body?.reservationToken || '').trim();
      const sig = String(body?.signature || '').trim();

      if (!id) return jsonErr('Missing id');
      if (!joiner) return jsonErr('Missing joiner');
      if (!reservationToken) return jsonErr('Missing reservationToken');
      if (!sig) return jsonErr('Missing signature');
      if (s.usedSigs.has(sig)) return jsonErr('Signature already used', 409);

      const round = s.rounds.get(id);
      if (!round) return jsonErr('Not found', 404);
      if (round.status !== 'created') return jsonErr(`Cannot join. Status=${round.status}`);

      const resv = round.reservation;
      if (!resv) return jsonErr('No reservation on round');
      if (resv.expiresAt <= now()) return jsonErr('Reservation expired');
      if (resv.token !== reservationToken) return jsonErr('Bad reservation token');
      if (resv.joiner !== joiner) return jsonErr('Reservation joiner mismatch');

      const { betLamports } = computeSplits(round.betSol);

      await assertDepositSig({
        connection,
        sig,
        expectedFrom: new PublicKey(joiner),
        expectedTo: TREASURY_POT,
        expectedLamports: betLamports,
      });

      s.usedSigs.add(sig);

      const joined: FlipRound = { ...round, joiner, status: 'joined', joinSig: sig };
      delete joined.reservation;
      s.rounds.set(id, joined);

      // Determinism proof (always returned)
      const proof =
        joined.signature && joined.joinSig
          ? pickWinnerDeterministic({
              createSig: joined.signature,
              joinSig: joined.joinSig,
              creator: joined.creator,
              joiner: joined.joiner!,
            })
          : null;

      // Auto-resolve (and return WHY if it didn't)
      const res = await tryResolve(id);

      return jsonOk({
        round: res.round,
        autoResolved: res.didResolve,
        proof,
        treasuryPot: TREASURY_POT.toBase58(),
      });
    }

    if (action === 'leave') {
      const id = String(body?.id || '').trim();
      const creator = String(body?.creator || '').trim();

      if (!id) return jsonErr('Missing id');
      if (!creator) return jsonErr('Missing creator');

      const round = s.rounds.get(id);
      if (!round) return jsonErr('Not found', 404);
      if (round.status !== 'created') return jsonErr(`Cannot leave. Status=${round.status}`);
      if (round.creator !== creator) return jsonErr('Creator mismatch');

      const { potLamports } = computeSplits(round.betSol);
      const refundLamports = potLamports;

      const bal = await connection.getBalance(TREASURY_POT);
      const required = refundLamports + MIN_TREASURY_BUFFER_LAMPORTS;

      if (bal < required) {
        const missingSol = (required - bal) / LAMPORTS_PER_SOL;
        return jsonErr(`Refund locked. Missing ${missingSol.toFixed(6)} SOL buffer.`);
      }

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: TREASURY_POT,
          toPubkey: new PublicKey(creator),
          lamports: refundLamports,
        })
      );

      const sig = await connection.sendTransaction(tx, [treasuryKp], {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      await connection.confirmTransaction(sig, 'confirmed');

      s.rounds.delete(id);

      return jsonOk({
        round: null,
        signature: sig,
        refundSol: refundLamports / LAMPORTS_PER_SOL,
      });
    }

    if (action === 'tryResolve') {
      const id = String(body?.id || '').trim();
      if (!id) return jsonErr('Missing id');

      const res = await tryResolve(id);

      const r = res.round;
      const proof =
        r.signature && r.joinSig && r.creator && r.joiner
          ? pickWinnerDeterministic({
              createSig: r.signature,
              joinSig: r.joinSig,
              creator: r.creator,
              joiner: r.joiner,
            })
          : null;

      return jsonOk({ round: res.round, didResolve: res.didResolve, proof });
    }

    return jsonErr('Unknown action', 400, { action });
  } catch (e: any) {
    return jsonErr(e?.message ?? String(e), 500);
  }
}

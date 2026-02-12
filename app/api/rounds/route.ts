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

/* ================= TYPES ================= */

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
  signature?: string;
  joinSig?: string;
  resolveSig?: string;
  reservation?: Reservation;
};

/* ================= MEMORY STORE ================= */

type Store = {
  rounds: Map<string, FlipRound>;
  usedSigs: Set<string>;
};

const STORE_KEY = '__SOLANA_FLIP_STORE__';

function store(): Store {
  // @ts-ignore
  if (!globalThis[STORE_KEY]) {
    // @ts-ignore
    globalThis[STORE_KEY] = {
      rounds: new Map<string, FlipRound>(),
      usedSigs: new Set<string>(),
    };
  }
  // @ts-ignore
  return globalThis[STORE_KEY];
}

/* ================= HELPERS ================= */

function now() {
  return Date.now();
}

function jsonOk(data: any) {
  return NextResponse.json(data, { status: 200 });
}

function jsonErr(error: string, status = 400, extra?: any) {
  return NextResponse.json({ error, ...(extra || {}) }, { status });
}

function makeId(prefix = 'mle') {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/* ================= CONFIG ================= */

const PLAY_FEE_BPS = 300;
const MIN_TREASURY_BUFFER_LAMPORTS = Math.round(0.001 * LAMPORTS_PER_SOL);
const RESERVATION_MS = 30_000;

/* ================= RPC ================= */

function getRpcUrl() {
  return process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
}

function getTreasuryKeypair(): Keypair {
  const raw = process.env.TREASURY_SECRET_KEY;
  if (!raw) throw new Error('Missing TREASURY_SECRET_KEY');

  const arr = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

/* ================= SELF HEAL CLEANER ================= */

function cleanReservation(r: FlipRound): FlipRound {
  if (r.reservation && r.reservation.expiresAt <= now()) {
    const cleaned = { ...r };
    delete cleaned.reservation;
    store().rounds.set(r.id, cleaned);
    return cleaned;
  }
  return r;
}

function cleanAllReservations() {
  const s = store();
  const t = now();
  for (const [id, r] of s.rounds.entries()) {
    if (r.reservation && r.reservation.expiresAt <= t) {
      const cleaned = { ...r };
      delete cleaned.reservation;
      s.rounds.set(id, cleaned);
    }
  }
}

/* ================= SPLITS ================= */

function computeSplits(betSol: number) {
  const betLamports = Math.round(betSol * LAMPORTS_PER_SOL);
  const feeLamports = Math.max(1, Math.floor((betLamports * PLAY_FEE_BPS) / 10_000));
  const potLamports = betLamports - feeLamports;
  return { betLamports, potLamports };
}

/* ================= WINNER ================= */

function pickWinner(createSig: string, joinSig: string, creator: string, joiner: string) {
  const hash = crypto.createHash('sha256').update(`${createSig}:${joinSig}`).digest();
  const bit = hash[hash.length - 1] % 2;
  return bit === 0 ? creator : joiner;
}

/* ================= RESOLVE ================= */

async function tryResolve(id: string) {
  const s = store();
  const r = s.rounds.get(id);
  if (!r) return null;
  if (r.status !== 'joined') return r;

  const treasury = getTreasuryKeypair();
  const connection = new Connection(getRpcUrl(), 'confirmed');

  const { potLamports } = computeSplits(r.betSol);
  const payout = potLamports * 2;

  const winner = pickWinner(r.signature!, r.joinSig!, r.creator, r.joiner!);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: treasury.publicKey,
      toPubkey: new PublicKey(winner),
      lamports: payout,
    })
  );

  const sig = await connection.sendTransaction(tx, [treasury]);
  await connection.confirmTransaction(sig, 'confirmed');

  const resolved: FlipRound = {
    ...r,
    status: 'resolved',
    winner,
    resolveSig: sig,
  };

  s.rounds.set(id, resolved);
  return resolved;
}

/* ================= ROUTE ================= */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body?.action;
    const s = store();
    cleanAllReservations();

    if (action === 'create') {
      const id = makeId();
      const round: FlipRound = {
        id,
        createdAt: now(),
        betSol: body.betSol,
        creator: body.creator,
        status: 'created',
        signature: body.signature,
      };
      s.rounds.set(id, round);
      return jsonOk({ round });
    }

    if (action === 'list') {
      const rounds = Array.from(s.rounds.values())
        .map(cleanReservation)
        .sort((a, b) => b.createdAt - a.createdAt);
      return jsonOk({ rounds });
    }

    if (action === 'get') {
      const r = s.rounds.get(body.id);
      if (!r) return jsonErr('Not found', 404);
      return jsonOk({ round: cleanReservation(r) });
    }

    if (action === 'reserveJoin') {
      const r = s.rounds.get(body.id);
      if (!r) return jsonErr('Not found', 404);

      const round = cleanReservation(r);
      if (round.status !== 'created') return jsonErr('Cannot reserve');

      if (round.reservation)
        return jsonErr('Already reserved', 409, { reservation: round.reservation });

      const reservation: Reservation = {
        token: makeId('rsv'),
        joiner: body.joiner,
        expiresAt: now() + RESERVATION_MS,
      };

      const updated = { ...round, reservation };
      s.rounds.set(round.id, updated);

      return jsonOk({ reservation, round: updated });
    }

    if (action === 'join') {
      const r = s.rounds.get(body.id);
      if (!r) return jsonErr('Not found', 404);

      const round = cleanReservation(r);
      if (!round.reservation) return jsonErr('No reservation');
      if (round.reservation.token !== body.reservationToken)
        return jsonErr('Bad reservation');

      const joined: FlipRound = {
        ...round,
        status: 'joined',
        joiner: body.joiner,
        joinSig: body.signature,
      };

      delete joined.reservation;
      s.rounds.set(round.id, joined);

      const resolved = await tryResolve(round.id);
      return jsonOk({ round: resolved });
    }

    return jsonErr('Unknown action');
  } catch (e: any) {
    return jsonErr(e?.message || 'Server error', 500);
  }
}

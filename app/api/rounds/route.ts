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
import { redis } from '@/lib/redis';

export const runtime = 'nodejs';

/* ================= CONFIG ================= */

const PLAY_FEE_BPS = 300;
const RESERVATION_MS = 30_000;

function now() {
  return Date.now();
}

function jsonOk(data: any) {
  return NextResponse.json(data);
}

function jsonErr(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function makeId(prefix = 'mle') {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function computeSplits(betSol: number) {
  const betLamports = Math.round(betSol * LAMPORTS_PER_SOL);
  const feeLamports = Math.max(1, Math.floor((betLamports * PLAY_FEE_BPS) / 10_000));
  const potLamports = betLamports - feeLamports;
  return { betLamports, potLamports };
}

function pickWinner(createSig: string, joinSig: string, creator: string, joiner: string) {
  const hash = crypto.createHash('sha256').update(`${createSig}:${joinSig}`).digest();
  const bit = hash[hash.length - 1] % 2;
  return bit === 0 ? creator : joiner;
}

function getRpcUrl() {
  return process.env.RPC_URL!;
}

function getTreasuryKeypair(): Keypair {
  const raw = process.env.TREASURY_SECRET_KEY!;
  const arr = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

/* ================= ROUTE ================= */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body?.action;

    const treasury = getTreasuryKeypair();
    const connection = new Connection(getRpcUrl(), 'confirmed');

    /* ================= CREATE ================= */

    if (action === 'create') {
      const id = makeId();

      const round = {
        id,
        createdAt: now(),
        betSol: body.betSol,
        creator: body.creator,
        status: 'created',
        signature: body.signature,
      };

      await redis.set(`flip:${id}`, round);

      // Lobby
      await redis.zadd('flips:created', {
        score: round.createdAt,
        member: id,
      });

      // History
      await redis.zadd('flips:all', {
        score: round.createdAt,
        member: id,
      });

      return jsonOk({ round });
    }

    /* ================= LIST (LOBBY + HISTORY) ================= */

if (action === 'list') {
  const only = body?.only as string | undefined;

  let key = 'flips:all';
  if (only === 'created') key = 'flips:created';

  const ids = await redis.zrange(key, 0, -1, { rev: true });

  const rounds: any[] = [];

  for (const id of ids) {
    const r = (await redis.get(`flip:${id}`)) as any; // ✅ TS fix
    if (!r) continue;

    if (only && r.status !== only) continue;

    rounds.push(r);
  }

  return jsonOk({ rounds });
}


    /* ================= GET ================= */

    if (action === 'get') {
      const r = await redis.get(`flip:${body.id}`);
      if (!r) return jsonErr('Not found', 404);
      return jsonOk({ round: r });
    }

    /* ================= RESERVE ================= */

    if (action === 'reserveJoin') {
      const r: any = await redis.get(`flip:${body.id}`);
      if (!r) return jsonErr('Not found', 404);
      if (r.status !== 'created') return jsonErr('Cannot reserve');

      const existing = await redis.get(`reservation:${body.id}`);
      if (existing) return jsonErr('Already reserved', 409);

      const reservation = {
        token: makeId('rsv'),
        joiner: body.joiner,
        expiresAt: now() + RESERVATION_MS,
      };

      await redis.set(`reservation:${body.id}`, reservation, {
        ex: RESERVATION_MS / 1000,
      });

      return jsonOk({ reservation, round: r });
    }

    /* ================= JOIN ================= */

    if (action === 'join') {
      const r: any = await redis.get(`flip:${body.id}`);
      if (!r) return jsonErr('Not found', 404);

      const reservation: any = await redis.get(`reservation:${body.id}`);
      if (!reservation) return jsonErr('Reservation expired');

      if (reservation.token !== body.reservationToken)
        return jsonErr('Bad reservation token');

      const joined = {
        ...r,
        status: 'joined',
        joiner: body.joiner,
        joinSig: body.signature,
      };

      await redis.set(`flip:${body.id}`, joined);
      await redis.del(`reservation:${body.id}`);

      // Remove from lobby
      await redis.zrem('flips:created', body.id);

      /* ================= RESOLVE ================= */

      const { potLamports } = computeSplits(joined.betSol);
      const payout = potLamports * 2;

      const winner = pickWinner(
        joined.signature,
        joined.joinSig,
        joined.creator,
        joined.joiner
      );

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: treasury.publicKey,
          toPubkey: new PublicKey(winner),
          lamports: payout,
        })
      );

      const sig = await connection.sendTransaction(tx, [treasury]);
      await connection.confirmTransaction(sig, 'confirmed');

      const resolved = {
        ...joined,
        status: 'resolved',
        winner,
        resolveSig: sig,
      };

      await redis.set(`flip:${body.id}`, resolved);

      return jsonOk({ round: resolved });
    }

    return jsonErr('Unknown action');
  } catch (e: any) {
    return jsonErr(e.message || 'Server error', 500);
  }
}

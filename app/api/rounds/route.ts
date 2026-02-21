// app/api/rounds/route.ts

import { NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import crypto from "crypto";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";

/* ================= CONFIG ================= */

const PLAY_FEE_BPS = 300;
const RESERVATION_MS = 30_000;

/* 🔒 HARDCODED FOR DEBUG */
const SOLARENA_MATCH_URL =
  "https://sol-arena-web.vercel.app/api/match";

const SOLARENA_GAME_KEY = process.env.SOLARENA_GAME_KEY || "";

function now() {
  return Date.now();
}

function jsonOk(data: any) {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}

function jsonErr(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function makeId(prefix = "flip") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function computeSplits(betSol: number) {
  const betLamports = Math.round(Number(betSol) * LAMPORTS_PER_SOL);
  const feeLamports = Math.max(1, Math.floor((betLamports * PLAY_FEE_BPS) / 10_000));
  const potLamports = betLamports - feeLamports;
  return { betLamports, feeLamports, potLamports };
}

function pickWinner(createSig: string, joinSig: string, creator: string, joiner: string) {
  const hash = crypto.createHash("sha256").update(`${createSig}:${joinSig}`).digest();
  const bit = hash[hash.length - 1] % 2;
  return bit === 0 ? creator : joiner;
}

function getRpcUrl() {
  return process.env.RPC_URL!;
}

function getTreasuryKeypair(): Keypair {
  const raw = process.env.TREASURY_SECRET_KEY!;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function acquireOnce(key: string, seconds: number) {
  const ok = await redis.set(key, "1", { nx: true, ex: seconds });
  return !!ok;
}

async function postSolarenaEvent(body: any) {
  if (!SOLARENA_GAME_KEY) {
    return { ok: false, error: "missing SOLARENA_GAME_KEY" };
  }

  try {
    const res = await fetch(SOLARENA_MATCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-game-key": SOLARENA_GAME_KEY,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body: text };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}

/* ================= ROUTE ================= */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    const treasury = getTreasuryKeypair();
    const connection = new Connection(getRpcUrl(), "confirmed");

    /* ================= CREATE ================= */

    if (action === "create") {
      const id = makeId();

      const round = {
        id,
        createdAt: now(),
        betSol: Number(body.betSol),
        creator: String(body.creator),
        status: "created",
        signature: String(body.signature),
      };

      await redis.set(`flip:${id}`, round);
      await redis.zadd("flips:created", { score: round.createdAt, member: id });
      await redis.zadd("flips:all", { score: round.createdAt, member: id });

      return jsonOk({ round });
    }

    /* ================= TRY RESOLVE ================= */

    if (action === "tryResolve") {
      const r = await redis.get(`flip:${body.id}`);
      return jsonOk({ round: r });
    }

    /* ================= JOIN ================= */

    if (action === "join") {
      const r: any = await redis.get(`flip:${body.id}`);
      if (!r) return jsonErr("Not found", 404);

      const joined = {
        ...r,
        status: "joined",
        joiner: String(body.joiner),
        joinSig: String(body.signature),
      };

      await redis.set(`flip:${body.id}`, joined);

      const { potLamports } = computeSplits(joined.betSol);
      const payoutLamports = potLamports * 2;

      const winner = pickWinner(joined.signature, joined.joinSig, joined.creator, joined.joiner);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: treasury.publicKey,
          toPubkey: new PublicKey(winner),
          lamports: payoutLamports,
        })
      );

      const sig = await connection.sendTransaction(tx, [treasury]);
      await connection.confirmTransaction(sig, "confirmed");

      const resolved = {
        ...joined,
        status: "resolved",
        winner,
        resolveSig: sig,
      };

      await redis.set(`flip:${body.id}`, resolved);

      let leaderboardDebug: any = null;

      const posted = await acquireOnce(`flip:solarena:posted:${body.id}`, 86400);

      if (posted) {
        const winnerRes = await postSolarenaEvent({
          wallet: winner,
          game: "flip",
          result: "win",
          amountSol: payoutLamports / LAMPORTS_PER_SOL,
        });

        const loser = winner === joined.creator ? joined.joiner : joined.creator;

        const loserRes = await postSolarenaEvent({
          wallet: loser,
          game: "flip",
          result: "play",
          amountSol: Number(joined.betSol),
        });

        leaderboardDebug = { winnerRes, loserRes };
      }

      return jsonOk({ round: resolved, leaderboardDebug });
    }

    return jsonErr("Unknown action");
  } catch (e: any) {
    return jsonErr(e?.message || "Server error", 500);
  }
}
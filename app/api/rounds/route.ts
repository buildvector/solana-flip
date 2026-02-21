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

// SolArena leaderboard integration
const SOLARENA_MATCH_URL =
  process.env.SOLARENA_MATCH_URL?.trim() ||
  "https://sol-arena-web.vercel.app/api/match";

const SOLARENA_GAME_KEY = process.env.SOLARENA_GAME_KEY?.trim() || "";

function now() {
  return Date.now();
}

function jsonOk(data: any) {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}

function jsonErr(error: string, status = 400, extra?: any) {
  return NextResponse.json({ error, ...(extra ?? {}) }, { status });
}

function makeId(prefix = "mle") {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
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

/** ✅ Robust env getters (works across your projects) */
function getRpcUrl() {
  const rpc =
    process.env.RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() ||
    process.env.SOLANA_RPC?.trim();

  if (!rpc) throw new Error("Missing RPC url env (RPC_URL or NEXT_PUBLIC_SOLANA_RPC)");
  return rpc;
}

function parseSecretKey(raw: string): Uint8Array {
  // Accept JSON array "[1,2,3]" (your current style)
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return Uint8Array.from(arr);
  } catch {}

  // Accept raw like "1,2,3"
  if (raw.includes(",")) {
    const arr = raw
      .replace(/[\[\]\s]/g, "")
      .split(",")
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n));
    if (arr.length >= 32) return Uint8Array.from(arr);
  }

  throw new Error("TREASURY secret key env is not a valid JSON array");
}

function getTreasuryKeypair(): Keypair {
  const raw =
    process.env.TREASURY_SECRET_KEY?.trim() ||
    process.env.TREASURY_SECRET_KEY_BASE58?.trim(); // your other project env name

  if (!raw) throw new Error("Missing treasury secret key env (TREASURY_SECRET_KEY or TREASURY_SECRET_KEY_BASE58)");
  return Keypair.fromSecretKey(parseSecretKey(raw));
}

type SolarenaResult = "win" | "play" | "loss";

async function postSolarenaEvent(params: {
  wallet: string;
  result: SolarenaResult;
  amountSol: number;
  roundId: string;
  role: "winner" | "loser";
  resolveSig?: string | null;
}) {
  try {
    if (!params.wallet) return;

    if (!SOLARENA_GAME_KEY) {
      console.log("[flip] SOLARENA_GAME_KEY missing -> skip leaderboard post");
      return;
    }

    if (!Number.isFinite(params.amountSol) || params.amountSol < 0) {
      console.log("[flip] amountSol invalid -> skip leaderboard post", params.amountSol);
      return;
    }

    const res = await fetch(SOLARENA_MATCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-game-key": SOLARENA_GAME_KEY,
      },
      body: JSON.stringify({
        wallet: params.wallet,
        game: "flip",
        result: params.result,
        amountSol: params.amountSol,
        meta: JSON.stringify({
          source: "flip",
          roundId: params.roundId,
          role: params.role,
          resolveSig: params.resolveSig ?? null,
        }),
      }),
    });

    const txt = await res.text().catch(() => "");
    console.log("[flip] postSolarenaEvent ->", res.status, txt.slice(0, 200));
  } catch (e: any) {
    console.log("[flip] postSolarenaEvent failed ->", e?.message ?? e);
  }
}

async function acquireOnce(key: string, seconds: number) {
  const ok = await redis.set(key, "1", { nx: true, ex: seconds });
  return !!ok;
}

/* ================= ROUTE ================= */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    // ✅ Fail fast with readable errors
    const treasury = getTreasuryKeypair();
    const connection = new Connection(getRpcUrl(), "confirmed");

    if (action === "create") {
      const id = makeId("flip");
      const betSol = Number(body?.betSol);
      const creator = String(body?.creator ?? "");
      const signature = String(body?.signature ?? "");

      if (!Number.isFinite(betSol) || betSol <= 0) return jsonErr("bad betSol", 400);
      if (!creator || creator.length < 10) return jsonErr("bad creator", 400);
      if (!signature || signature.length < 10) return jsonErr("bad signature", 400);

      const round = {
        id,
        createdAt: now(),
        betSol,
        creator,
        status: "created",
        signature,
      };

      await redis.set(`flip:${id}`, round);
      await redis.zadd("flips:created", { score: round.createdAt, member: id });
      await redis.zadd("flips:all", { score: round.createdAt, member: id });

      return jsonOk({ round });
    }

    if (action === "list") {
      const only = body?.only as string | undefined;
      const limit = Math.min(200, Math.max(1, Number(body?.limit ?? 80)));

      let key = "flips:all";
      if (only === "created") key = "flips:created";

      const ids = await redis.zrange(key, 0, limit - 1, { rev: true });
      const rounds: any[] = [];

      for (const id of ids) {
        const r = (await redis.get(`flip:${id}`)) as any;
        if (!r) continue;
        if (only && r.status !== only) continue;
        rounds.push(r);
      }

      return jsonOk({ rounds });
    }

    if (action === "get") {
      const r = await redis.get(`flip:${body.id}`);
      if (!r) return jsonErr("Not found", 404);
      return jsonOk({ round: r });
    }

    if (action === "reserveJoin") {
      const r: any = await redis.get(`flip:${body.id}`);
      if (!r) return jsonErr("Not found", 404);
      if (r.status !== "created") return jsonErr("Cannot reserve");

      const existing = await redis.get(`reservation:${body.id}`);
      if (existing) return jsonErr("Already reserved", 409);

      const reservation = {
        token: makeId("rsv"),
        joiner: String(body.joiner),
        expiresAt: now() + RESERVATION_MS,
      };

      await redis.set(`reservation:${body.id}`, reservation, { ex: RESERVATION_MS / 1000 });
      return jsonOk({ reservation, round: r });
    }

    if (action === "tryResolve") {
      const r: any = await redis.get(`flip:${body.id}`);
      if (!r) return jsonErr("Not found", 404);
      return jsonOk({ round: r });
    }

    if (action === "join") {
      const r: any = await redis.get(`flip:${body.id}`);
      if (!r) return jsonErr("Not found", 404);

      const reservation: any = await redis.get(`reservation:${body.id}`);
      if (!reservation) return jsonErr("Reservation expired");
      if (reservation.token !== body.reservationToken) return jsonErr("Bad reservation token");

      const joined = {
        ...r,
        status: "joined",
        joiner: String(body.joiner),
        joinSig: String(body.signature),
      };

      await redis.set(`flip:${body.id}`, joined);
      await redis.del(`reservation:${body.id}`);
      await redis.zrem("flips:created", body.id);

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

      const resolved = { ...joined, status: "resolved", winner, resolveSig: sig };
      await redis.set(`flip:${body.id}`, resolved);

      const posted = await acquireOnce(`flip:solarena:posted:${body.id}`, 24 * 60 * 60);
      if (posted) {
        const winnerPk = String(winner);
        const loserPk = winnerPk === String(joined.creator) ? String(joined.joiner) : String(joined.creator);

        const payoutSol = payoutLamports / LAMPORTS_PER_SOL;
        const betSol = Number(joined.betSol) || 0;

        await postSolarenaEvent({
          wallet: winnerPk,
          result: "win",
          amountSol: payoutSol,
          roundId: body.id,
          role: "winner",
          resolveSig: sig,
        });

        await postSolarenaEvent({
          wallet: loserPk,
          result: "play",
          amountSol: betSol,
          roundId: body.id,
          role: "loser",
          resolveSig: sig,
        });
      }

      return jsonOk({ round: resolved });
    }

    return jsonErr("Unknown action", 400, { action });
  } catch (e: any) {
    console.error("[flip] error", e);
    return jsonErr(e?.message || "Server error", 500);
  }
}
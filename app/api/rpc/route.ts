import { NextResponse } from 'next/server';

const UPSTREAM_RPC = 'https://api.mainnet-beta.solana.com';

export async function POST(req: Request) {
  try {
    const body = await req.text();

    const upstreamRes = await fetch(UPSTREAM_RPC, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });

    const text = await upstreamRes.text();

    return new NextResponse(text, {
      status: upstreamRes.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e?.message ?? String(e) } },
      { status: 500 }
    );
  }
}

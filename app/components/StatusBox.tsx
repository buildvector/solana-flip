'use client';

import { Card, Label, Mono } from './ui';

export default function StatusBox({ status }: { status: string }) {
  const lines = (status || '').trim();

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Status</div>
          <div className="mt-1 text-xs text-zinc-500">Last event log (local UI)</div>
        </div>

        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
          console
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
        <Label className="mb-2">Output</Label>
        <Mono className="text-xs text-zinc-200">
          <pre className="whitespace-pre-wrap break-words">{lines || '—'}</pre>
        </Mono>
      </div>
    </Card>
  );
}

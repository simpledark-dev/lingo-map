'use client';

import dynamic from 'next/dynamic';

const GameCanvas = dynamic(() => import('../ui/GameCanvas'), { ssr: false });

export default function Home() {
  return (
    <main className="flex h-dvh items-center justify-center bg-black overflow-hidden">
      <GameCanvas />
    </main>
  );
}

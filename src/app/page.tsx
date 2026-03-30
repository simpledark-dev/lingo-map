'use client';

import dynamic from 'next/dynamic';

const GameCanvas = dynamic(() => import('../ui/GameCanvas'), { ssr: false });

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black">
      <GameCanvas />
    </main>
  );
}

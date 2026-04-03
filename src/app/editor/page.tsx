'use client';

import dynamic from 'next/dynamic';

const EditorCanvas = dynamic(() => import('../../editor/EditorCanvas'), { ssr: false });

export default function EditorPage() {
  return <EditorCanvas />;
}

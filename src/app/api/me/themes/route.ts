import { promises as fs } from 'fs';
import path from 'path';

const ME_ROOT = path.join(process.cwd(), 'public', 'assets', 'me');

/** List all "Singles" theme folders inside the Modern Exteriors pack symlink.
 * The pack ships each theme's individual sprites under
 * `<theme>_Singles_16x16/`, alongside a per-theme master PNG (which we ignore
 * here — we only browse the singles). */
export async function GET(): Promise<Response> {
  try {
    const entries = await fs.readdir(ME_ROOT, { withFileTypes: true });
    const themes = entries
      .filter(e => e.isDirectory() && e.name.endsWith('_Singles_16x16'))
      .map(e => e.name)
      .sort((a, b) => leadingNum(a) - leadingNum(b));
    return Response.json({ themes });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return Response.json({ themes: [], hint: 'public/assets/me/ not found — symlink may be missing' });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

/** Pull the leading "1_", "10_" etc. so the themes sort numerically. */
function leadingNum(name: string): number {
  const m = /^(\d+)_/.exec(name);
  return m ? parseInt(m[1], 10) : 9999;
}

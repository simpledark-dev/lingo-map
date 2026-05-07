import { promises as fs } from 'fs';
import path from 'path';

const MI_SINGLES_ROOT = path.join(process.cwd(), 'public', 'assets', 'mi-singles');

/** List all "Singles" theme folders under the Modern Interiors symlink.
 * Modern Interiors uses `<digits>_<words>_Singles` (no `_16x16` suffix
 * unlike Modern Exteriors), so the filter matches a slightly different
 * pattern. We additionally accept `_Sport` (for `6_Music_and_Sport`,
 * which the upstream pack ships without the trailing `_Singles`). */
export async function GET(): Promise<Response> {
  try {
    const entries = await fs.readdir(MI_SINGLES_ROOT, { withFileTypes: true });
    const themes = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort((a, b) => leadingNum(a) - leadingNum(b));
    return Response.json({ themes });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return Response.json({ themes: [], hint: 'public/assets/mi-singles/ not found — symlink may be missing' });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

/** Pull the leading "1_", "10_" etc. so the themes sort numerically. */
function leadingNum(name: string): number {
  const m = /^(\d+)_/.exec(name);
  return m ? parseInt(m[1], 10) : 9999;
}

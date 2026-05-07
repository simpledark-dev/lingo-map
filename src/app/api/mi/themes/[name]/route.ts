import { promises as fs } from 'fs';
import path from 'path';

const MI_SINGLES_ROOT = path.join(process.cwd(), 'public', 'assets', 'mi-singles');

/** Whitelist theme folder names. Looser than the Modern Exteriors
 * counterpart because Limezu's interior pack mixes suffixes like
 * `_Singles`, `_SInglesS` (typo), and `_Sport` — but every folder is
 * still digits/letters/underscores, so disallowing anything else is
 * enough to prevent traversal (`../`) attempts. */
function sanitizeTheme(name: string): string | null {
  return /^[0-9A-Za-z_]+$/.test(name) ? name : null;
}

/** List PNG filenames inside a single Modern Interiors theme folder.
 * Returns names without the `.png` extension; the editor turns each
 * into a pack-tile key of shape `mi-s:<theme>/<stem>`. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const { name: rawName } = await params;
  const name = sanitizeTheme(rawName);
  if (!name) return Response.json({ error: 'Invalid theme name' }, { status: 400 });

  try {
    const dir = path.join(MI_SINGLES_ROOT, name);
    const entries = await fs.readdir(dir);
    const files = entries
      .filter(f => f.toLowerCase().endsWith('.png'))
      .map(f => f.slice(0, -'.png'.length))
      .sort(naturalCompare);
    return Response.json({ files });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return Response.json({ error: 'Theme not found' }, { status: 404 });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

/** Sort `Kitchen_Singles_2`, `_10`, `_100` numerically rather than
 * lexicographically — without this, a player browsing the singles
 * sees the order 1, 10, 100, 11, 12, ..., which makes a related set
 * (e.g. all the chairs) jump around the grid. */
function naturalCompare(a: string, b: string): number {
  const segs = (s: string) => s.split(/(\d+)/).map(seg => /^\d+$/.test(seg) ? parseInt(seg, 10) : seg);
  const A = segs(a);
  const B = segs(b);
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const x = A[i];
    const y = B[i];
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y;
    } else {
      const c = String(x).localeCompare(String(y));
      if (c !== 0) return c;
    }
  }
  return A.length - B.length;
}

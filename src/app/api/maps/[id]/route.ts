import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

/** Only allow safe map IDs — no slashes, dots, etc. */
function sanitizeId(id: string): string | null {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) return null;
  return id;
}

/** Save a single map as JSON. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: rawId } = await params;
  const id = sanitizeId(rawId);
  if (!id) return Response.json({ error: 'Invalid map id' }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Minimum shape check. `layers` is the authoritative content store
  // post-refactor; `tiles` is still accepted for back-compat with older
  // editor builds but no longer required (normalize derives it on load).
  const m = body as { layers?: unknown; tiles?: unknown; width?: unknown; height?: unknown };
  const hasContent = Array.isArray(m.layers) || Array.isArray(m.tiles);
  if (!hasContent || typeof m.width !== 'number' || typeof m.height !== 'number') {
    return Response.json({ error: 'Map missing required fields' }, { status: 400 });
  }

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(path.join(DATA_DIR, `${id}.json`), JSON.stringify(body, null, 2), 'utf8');
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

/** Load a single map by id. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: rawId } = await params;
  const id = sanitizeId(rawId);
  if (!id) return Response.json({ error: 'Invalid map id' }, { status: 400 });

  try {
    const contents = await fs.readFile(path.join(DATA_DIR, `${id}.json`), 'utf8');
    return new Response(contents, { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

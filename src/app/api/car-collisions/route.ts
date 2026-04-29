import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'car-collisions.json');

/** Per-sprite collision boxes for ambient cars. The editor's
 * CarCollisionEditor writes here, the runtime (PixiApp) reads here on
 * scene load — single shared file so edits survive in git instead of
 * sitting in browser localStorage. */
export async function GET(): Promise<Response> {
  try {
    const contents = await fs.readFile(FILE, 'utf8');
    return new Response(contents, { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // Treat a missing file as an empty override map. Beats forcing the
      // user to commit a `{}` file before edits take effect.
      return Response.json({});
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

/** Replace the whole overrides map. The body must be a flat object whose
 * values are `{offsetX, offsetY, width, height}` — extra fields are
 * preserved verbatim, but the value type is shape-checked so a stray
 * editor bug can't write garbage that crashes the runtime. */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Body must be an object keyed by sprite key' }, { status: 400 });
  }
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof key !== 'string' || !value || typeof value !== 'object') {
      return Response.json({ error: `Invalid entry for "${key}"` }, { status: 400 });
    }
    const v = value as Record<string, unknown>;
    if (typeof v.offsetX !== 'number' || typeof v.offsetY !== 'number'
      || typeof v.width !== 'number' || typeof v.height !== 'number') {
      return Response.json({ error: `Entry "${key}" missing offsetX/offsetY/width/height` }, { status: 400 });
    }
  }
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(body, null, 2), 'utf8');
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

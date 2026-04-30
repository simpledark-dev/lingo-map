import { promises as fs } from 'fs';
import path from 'path';
import { parseSavedMap } from '../../../../core/SaveSchema';

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUP_KEEP = 3;

/** Only allow safe map IDs — no slashes, dots, etc. */
function sanitizeId(id: string): string | null {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) return null;
  return id;
}

/**
 * Rotate a single-file backup chain:
 *   <id>.json.bak2  <-  <id>.json.bak1
 *   <id>.json.bak1  <-  <id>.json.bak
 *   <id>.json.bak   <-  <id>.json   (the file we're about to overwrite)
 *
 * We hold up to `BACKUP_KEEP` previous saves so a destructive autosave
 * (the bug class we just shipped a fix for) leaves a way back. Each step
 * fails silently if the source doesn't exist — no fatal "couldn't rotate"
 * since a fresh map has nothing to rotate yet.
 */
async function rotateBackups(filePath: string): Promise<void> {
  const try_rename = async (from: string, to: string) => {
    try { await fs.rename(from, to); } catch { /* source missing, skip */ }
  };
  for (let i = BACKUP_KEEP - 1; i >= 1; i--) {
    await try_rename(`${filePath}.bak${i}`, `${filePath}.bak${i + 1}`);
  }
  await try_rename(`${filePath}.bak`, `${filePath}.bak1`);
  await try_rename(filePath, `${filePath}.bak`);
}

/**
 * Atomic write: write to `<file>.tmp` then rename onto `<file>`. POSIX
 * rename is atomic, so a SIGINT/crash mid-write either leaves the file
 * pristine (rename hadn't happened yet) or fully replaced — never
 * truncated. The earlier raw `fs.writeFile` could leave a partial JSON.
 */
async function atomicWrite(filePath: string, contents: string): Promise<void> {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, contents, 'utf8');
  await fs.rename(tmp, filePath);
}

/** Save a single map as JSON. Disabled in production builds — Vercel's
 * runtime filesystem is read-only and per-request ephemeral, so a write
 * here either errors or silently lands on an instance nobody else sees.
 * Editor is intended to run locally; commit + redeploy to ship changes.
 *
 * Hardening (post-corruption-bug):
 *  - Body is run through `parseSavedMap` BEFORE touching disk, so a
 *    malformed/version-future client can't silently overwrite a valid
 *    file. Errors return 400 with the typed reason.
 *  - Previous version is rotated to <id>.json.bak / .bak1 / .bak2.
 *  - Final write is atomic via tmp-file + rename so a crash mid-save
 *    never truncates the live file.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Map editing is disabled in production. Run the editor locally and commit changes.' }, { status: 403 });
  }
  const { id: rawId } = await params;
  const id = sanitizeId(rawId);
  if (!id) return Response.json({ error: 'Invalid map id' }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseSavedMap(body);
  if (!parsed.ok) {
    return Response.json({ error: `Rejected save: ${parsed.error}` }, { status: 400 });
  }

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const filePath = path.join(DATA_DIR, `${id}.json`);
    await rotateBackups(filePath);
    await atomicWrite(filePath, JSON.stringify(body, null, 2));
    return Response.json({ ok: true, migrated: parsed.migrated });
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

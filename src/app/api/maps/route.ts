import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

/** List all persisted maps (one JSON per map, merged into a single response). */
export async function GET() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const files = await fs.readdir(DATA_DIR);
    const maps: Record<string, unknown> = {};
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const id = file.slice(0, -'.json'.length);
      const contents = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
      try {
        maps[id] = JSON.parse(contents);
      } catch {
        // skip corrupt files
      }
    }
    return Response.json({ maps });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

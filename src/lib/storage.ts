import path from "path";
import fs from "fs";
import fsp from "fs/promises";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const FILES_DIR = path.join(DATA_DIR, "files");

/**
 * Resolve a storage path (e.g. "scans/3/front.jpg") to an absolute path,
 * refusing anything that escapes the files directory.
 */
export function resolveStoragePath(storagePath: string): string {
  const abs = path.resolve(FILES_DIR, storagePath);
  if (!abs.startsWith(FILES_DIR + path.sep)) {
    throw new Error(`Invalid storage path: ${storagePath}`);
  }
  return abs;
}

export async function saveFile(storagePath: string, data: Buffer | Uint8Array): Promise<void> {
  const abs = resolveStoragePath(storagePath);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, data);
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  return fsp.readFile(resolveStoragePath(storagePath));
}

export function storedFileExists(storagePath: string): boolean {
  try {
    return fs.statSync(resolveStoragePath(storagePath)).isFile();
  } catch {
    return false;
  }
}

/** URL under which a stored file is served to the browser. */
export function fileUrl(storagePath: string): string {
  return `/api/files/${storagePath}`;
}

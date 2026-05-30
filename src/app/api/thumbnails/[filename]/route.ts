import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const MIME_MAP: Record<string, string> = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
};

// GET /api/thumbnails/[filename] - Serve course thumbnail images
// Thumbnails are stored in uploads/thumbnails/ (volume-mounted, always writable).
// Falls back to public/thumbnails/ for images uploaded before this change.
export async function GET(
  _req: NextRequest,
  { params }: { params: { filename: string } }
) {
  const { filename } = params;

  // Block path traversal and non-image filenames before touching the filesystem.
  if (
    !filename ||
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    !/^[A-Za-z0-9_\-.]+$/.test(filename)
  ) {
    return new NextResponse('Not found', { status: 404 });
  }

  const ext = path.extname(filename).toLowerCase();
  const mimeType = MIME_MAP[ext];
  if (!mimeType) {
    return new NextResponse('Not found', { status: 404 });
  }

  const uploadsDir = path.resolve(process.cwd(), 'uploads', 'thumbnails');
  const publicDir  = path.resolve(process.cwd(), 'public',  'thumbnails');

  // Try uploads/thumbnails first (new location), then public/thumbnails (legacy).
  const candidates = [
    path.join(uploadsDir, filename),
    path.join(publicDir,  filename),
  ];

  let filePath: string | null = null;
  for (const candidate of candidates) {
    // Defence-in-depth path check even though filename is already validated above.
    const inUploads = candidate.startsWith(uploadsDir + path.sep);
    const inPublic  = candidate.startsWith(publicDir  + path.sep);
    if (!inUploads && !inPublic) continue;

    try {
      await fs.access(candidate);
      filePath = candidate;
      break;
    } catch {
      // file not found in this location — try next
    }
  }

  if (!filePath) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const stat = await fs.lstat(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return new NextResponse('Not found', { status: 404 });
    }

    const bytes = await fs.readFile(filePath);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(stat.size),
        // Thumbnails are public and don't change (UUID filenames) — cache aggressively.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}

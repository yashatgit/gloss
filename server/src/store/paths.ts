import path from 'node:path';
import { resolveDataDir } from '../config';

export function indexPath(): string {
  return path.join(resolveDataDir(), 'index.json');
}

export function docDir(docId: string): string {
  return path.join(resolveDataDir(), 'documents', docId);
}

export function documentPath(docId: string): string {
  return path.join(docDir(docId), 'document.json');
}

export function canvasPath(docId: string): string {
  return path.join(docDir(docId), 'canvas.json');
}

export function assetsDir(docId: string): string {
  return path.join(docDir(docId), 'assets');
}

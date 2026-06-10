import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type {
  BranchNode,
  Canvas,
  CanvasNode,
  Doc,
  DocumentSummary,
} from '@reader/shared';
import { canvasPath, docDir, documentPath, indexPath } from './paths';

export interface DocState {
  document: Doc;
  canvas: Canvas;
}

const WRITE_DEBOUNCE_MS = 500;

/**
 * In-memory canonical state, persisted as JSON. Writes are debounced per
 * document and atomic (tmp file + rename). Local single-user scale only.
 */
class Store {
  private docs = new Map<string, DocState>();
  private index: DocumentSummary[] = [];
  /** branchId → docId for branch routes that don't carry a docId. */
  private branchIndex = new Map<string, string>();
  private pendingWrites = new Map<string, NodeJS.Timeout>();
  private activeWrites = new Set<string>();
  private indexDirty = false;

  async init(): Promise<void> {
    try {
      this.index = JSON.parse(await fsp.readFile(indexPath(), 'utf8'));
    } catch {
      this.index = [];
    }
    for (const entry of this.index) {
      try {
        const document: Doc = JSON.parse(
          await fsp.readFile(documentPath(entry.id), 'utf8'),
        );
        const canvas: Canvas = JSON.parse(
          await fsp.readFile(canvasPath(entry.id), 'utf8'),
        );
        this.docs.set(entry.id, { document, canvas });
        for (const node of canvas.nodes) {
          if (node.kind === 'branch') this.branchIndex.set(node.id, entry.id);
        }
      } catch (err) {
        console.error(`store: failed to load document ${entry.id}:`, err);
      }
    }
  }

  listDocuments(): DocumentSummary[] {
    return [...this.index].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getDoc(docId: string): DocState | undefined {
    return this.docs.get(docId);
  }

  getBranch(branchId: string): { state: DocState; branch: BranchNode } | undefined {
    const docId = this.branchIndex.get(branchId);
    if (!docId) return undefined;
    const state = this.docs.get(docId);
    if (!state) return undefined;
    const branch = state.canvas.nodes.find(
      (n): n is BranchNode => n.kind === 'branch' && n.id === branchId,
    );
    return branch ? { state, branch } : undefined;
  }

  createDocument(document: Doc, canvas: Canvas): DocState {
    const state: DocState = { document, canvas };
    this.docs.set(document.id, state);
    this.index.push({
      id: document.id,
      title: document.title,
      createdAt: document.createdAt,
    });
    this.indexDirty = true;
    this.scheduleWrite(document.id);
    return state;
  }

  addBranch(docId: string, branch: BranchNode): void {
    const state = this.docs.get(docId);
    if (!state) throw new Error(`unknown document ${docId}`);
    state.canvas.nodes.push(branch);
    this.branchIndex.set(branch.id, docId);
    this.scheduleWrite(docId);
  }

  /** Deletes a branch and every descendant branch anchored (transitively) into it. */
  deleteBranch(branchId: string): boolean {
    const docId = this.branchIndex.get(branchId);
    if (!docId) return false;
    const state = this.docs.get(docId);
    if (!state) return false;

    const doomed = new Set([branchId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const node of state.canvas.nodes) {
        if (node.kind === 'branch' && doomed.has(node.parentNodeId) && !doomed.has(node.id)) {
          doomed.add(node.id);
          grew = true;
        }
      }
    }
    state.canvas.nodes = state.canvas.nodes.filter((n) => !doomed.has(n.id));
    for (const id of doomed) this.branchIndex.delete(id);
    this.scheduleWrite(docId);
    return true;
  }

  updateNode(
    docId: string,
    nodeId: string,
    patch: { x?: number; y?: number; width?: number; height?: number },
  ): boolean {
    const state = this.docs.get(docId);
    if (!state) return false;
    const node = state.canvas.nodes.find((n) => n.id === nodeId);
    if (!node) return false;
    if (patch.x !== undefined && patch.y !== undefined) node.position = { x: patch.x, y: patch.y };
    if (patch.width !== undefined) (node as { width?: number }).width = patch.width;
    if (patch.height !== undefined) (node as { height?: number }).height = patch.height;
    this.scheduleWrite(docId);
    return true;
  }

  /** Delete a document and everything under it (files, index entry, in-memory). */
  async deleteDocument(docId: string): Promise<boolean> {
    const state = this.docs.get(docId);
    if (!state) return false;
    const pending = this.pendingWrites.get(docId);
    if (pending) {
      clearTimeout(pending);
      this.pendingWrites.delete(docId);
    }
    for (const node of state.canvas.nodes) {
      if (node.kind === 'branch') this.branchIndex.delete(node.id);
    }
    this.docs.delete(docId);
    this.index = this.index.filter((e) => e.id !== docId);
    this.indexDirty = true;
    try {
      await fsp.rm(docDir(docId), { recursive: true, force: true });
      await atomicWrite(indexPath(), JSON.stringify(this.index, null, 2));
      this.indexDirty = false;
    } catch (err) {
      console.error(`store: delete failed for ${docId}:`, err);
    }
    return true;
  }

  /** Mark a document mutated (e.g. messages appended) so it gets persisted. */
  touch(docId: string): void {
    this.scheduleWrite(docId);
  }

  private scheduleWrite(docId: string): void {
    const existing = this.pendingWrites.get(docId);
    if (existing) clearTimeout(existing);
    this.pendingWrites.set(
      docId,
      setTimeout(() => {
        this.pendingWrites.delete(docId);
        void this.writeDoc(docId);
      }, WRITE_DEBOUNCE_MS),
    );
  }

  /** Cancel the debounce and persist immediately (e.g. after a chat reply). */
  async flushNow(docId: string): Promise<void> {
    const pending = this.pendingWrites.get(docId);
    if (pending) {
      clearTimeout(pending);
      this.pendingWrites.delete(docId);
    }
    await this.writeDoc(docId);
  }

  private async writeDoc(docId: string): Promise<void> {
    const state = this.docs.get(docId);
    if (!state) return;
    // Never run two writes for the same doc concurrently — overlapping tmp
    // files would corrupt the rename. Re-schedule so the mutation still lands.
    if (this.activeWrites.has(docId)) {
      this.scheduleWrite(docId);
      return;
    }
    this.activeWrites.add(docId);
    try {
      await fsp.mkdir(docDir(docId), { recursive: true });
      await atomicWrite(documentPath(docId), JSON.stringify(state.document, null, 2));
      await atomicWrite(canvasPath(docId), JSON.stringify(state.canvas, null, 2));
      if (this.indexDirty) {
        this.indexDirty = false;
        await atomicWrite(indexPath(), JSON.stringify(this.index, null, 2));
      }
    } catch (err) {
      console.error(`store: write failed for ${docId}:`, err);
    } finally {
      this.activeWrites.delete(docId);
    }
  }

  /** Synchronous flush for shutdown (SIGINT / Electron quit hook). */
  flushAllSync(): void {
    for (const [docId, timer] of this.pendingWrites) {
      clearTimeout(timer);
      const state = this.docs.get(docId);
      if (!state) continue;
      fs.mkdirSync(docDir(docId), { recursive: true });
      fs.writeFileSync(documentPath(docId), JSON.stringify(state.document, null, 2));
      fs.writeFileSync(canvasPath(docId), JSON.stringify(state.canvas, null, 2));
    }
    this.pendingWrites.clear();
    fs.mkdirSync(path.dirname(indexPath()), { recursive: true });
    fs.writeFileSync(indexPath(), JSON.stringify(this.index, null, 2));
  }
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmp = `${filePath}.tmp`;
  await fsp.writeFile(tmp, content, 'utf8');
  await fsp.rename(tmp, filePath);
}

export const store = new Store();

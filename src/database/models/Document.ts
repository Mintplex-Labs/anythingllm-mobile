import { field, json, text } from '@nozbe/watermelondb/decorators';
import { database } from '@/database';
import { Q, Model } from '@nozbe/watermelondb';
import { generateUUID } from '@/utils/constants';
import VectorDB from '@/utils/VectorDB';
import { deleteProcessedFilesNotIn, searchProcessedFilesFor } from '@/utils/fs';
import type { FullContextDocument } from '@/utils/documents/fullContext';

export type DocumentType = {
  name: string;
  uuid: string;
  workspaceSlug: string;
  /**
   * Thread the document belongs to. Only set for full-context documents so that files shared or
   * attached in one conversation never pile into another. Null = workspace-wide (embedded documents,
   * and full-context documents attached before thread scoping existed).
   */
  threadSlug: string | null;
  /**
   * Ids of the document's chunks in the vector store. Empty for documents attached while an external
   * provider was selected: those are never embedded and are sent to the model in full instead
   * (see `isFullContext` and utils/documents/fullContext).
   */
  vectorBoxIds: string[];
  createdAt: number;
};

// Ensure the vector box ids are an array of numbers
const sanitizeVectorBoxIds = (json: string) => {
  return Array.isArray(json) ? json.map(Number) : [];
}

export default class Document extends Model {
  static table = 'workspace_documents';

  @text('name') name!: string;
  @text('uuid') uuid!: string;
  @text('workspace_slug') workspaceSlug!: string;
  @text('thread_slug') threadSlug!: string | null;
  @json('vector_box_ids', sanitizeVectorBoxIds) vectorBoxIds!: number[];
  @field('created_at') createdAt!: number;

  static log(message: any, ...args: any[]) {
    console.log(`\x1b[32m[db:Document]\x1b[0m`, message, ...args) // eslint-disable-line no-console
  }

  /**
   * Whether the model receives this document whole rather than as retrieved chunks. Documents attached
   * with an external provider selected are stored without vectors; on-device attachments are embedded.
   */
  static isFullContext(document: Pick<DocumentType, 'vectorBoxIds'>): boolean {
    return !document.vectorBoxIds || document.vectorBoxIds.length === 0;
  }

  /**
   * Whether a full-context document applies to the given thread: its own thread, or any thread when it
   * predates thread scoping (`threadSlug` null).
   */
  static appliesToThread(document: Pick<DocumentType, 'threadSlug'>, threadSlug: string | null): boolean {
    return !document.threadSlug || document.threadSlug === threadSlug;
  }

  /**
   * The full-context documents to send with a prompt in `threadSlug`, together with their text (read
   * back from the processed folder). Only documents attached in that thread (plus legacy workspace-wide
   * ones) are returned, so separate shares never mix. Documents whose processed text is missing are
   * skipped rather than failing the prompt.
   */
  static async fullContextDocumentsFor(workspaceSlug: string, threadSlug: string | null): Promise<FullContextDocument[]> {
    if (!workspaceSlug) return [];
    const documents: DocumentType[] = await Document.find([{ field: 'workspace_slug', value: workspaceSlug }]);
    const results: FullContextDocument[] = [];
    for (const document of documents) {
      if (!Document.isFullContext(document)) continue;
      if (!Document.appliesToThread(document, threadSlug)) continue;
      const content = await searchProcessedFilesFor(document.name, 'eq');
      if (!content) {
        this.log(`processed text for "${document.name}" is missing - it will not be sent to the model`);
        continue;
      }
      results.push({ uuid: document.uuid, name: document.name, content });
    }
    return results;
  }

  static toDocumentObject(data: any): DocumentType {
    const { name, uuid, workspaceSlug, threadSlug = null, vectorBoxIds, createdAt } = data;
    return {
      name: name,
      uuid: uuid,
      workspaceSlug: workspaceSlug,
      threadSlug: threadSlug ?? null,
      vectorBoxIds: vectorBoxIds,
      createdAt,
    };
  }

  /**
   * Find documents by a given set of where clauses
   * @param where - An array of where clauses
   * @returns An array of documents with the DocumentType interface
   */
  static async find(where: { field: string, value: string }[] = []): Promise<any> {
    const documents = await database.get(Document.table).query(
      where.map(({ field, value }) => Q.where(field, value))
    ).fetch();
    return documents.map((document) => this.toDocumentObject(document));
  }

  static async create({
    name = 'New Document',
    workspaceSlug,
    threadSlug = null,
    vectorBoxIds = [],
  }: {
    name: string;
    workspaceSlug: string;
    /** Set for full-context documents so they only apply to the thread they were attached in */
    threadSlug?: string | null;
    vectorBoxIds: number[];
  }): Promise<DocumentType | null> {
    if (!workspaceSlug) {
      this.log('no workspace slug provided for document creation', { name });
      return null;
    }

    let newDocument: any;
    await database.write(async () => {
      newDocument = await database.get(Document.table).create((document: any) => {
        document.name = name;
        document.uuid = generateUUID();
        document.workspaceSlug = workspaceSlug;
        document.threadSlug = threadSlug;
        document.vectorBoxIds = vectorBoxIds;
        document.createdAt = Date.now();
      });
    });
    newDocument = this.toDocumentObject(newDocument);
    this.log(`newDocument created ${newDocument.uuid} - ${newDocument.name}`);
    return newDocument;
  }

  /**
   * Remove processed text files that no remaining document (in any workspace) refers to.
   * The processed folder is keyed by filename only, so a file is kept while any workspace still uses it.
   */
  static async purgeUnreferencedProcessedFiles(): Promise<void> {
    try {
      const remaining = await database.get(Document.table).query().fetch() as (Model & DocumentType)[];
      const referenced = remaining.map((doc) => doc.name).filter(Boolean);
      const removed = await deleteProcessedFilesNotIn(referenced);
      if (removed.length) this.log(`removed ${removed.length} processed file(s) no document references`);
    } catch (error) {
      console.error('Error purging processed files:', error);
    }
  }

  static async deleteByUuids(uuids: string[], withVectors: boolean = false): Promise<any> {
    try {
      if (!uuids.length) return true;

      let vectorBoxIds: number[] = [];
      await database.write(async () => {
        const documents = await database.get(Document.table).query(
          Q.where('uuid', Q.oneOf(uuids))
        ).fetch();

        if (documents.length === 0) return;
        this.log(`deleting ${documents.length} documents by uuids`);
        for (const document of documents) {
          // @ts-ignore
          let documentVectorBoxIds = document._raw.vector_box_ids;
          if (typeof documentVectorBoxIds === 'string') documentVectorBoxIds = JSON.parse(documentVectorBoxIds);
          vectorBoxIds = [...vectorBoxIds, ...(documentVectorBoxIds || [])];
          await document.destroyPermanently();
        }
      });

      if (withVectors) {
        this.log(`deleting ${vectorBoxIds.length} vectors associated with documents`);
        await VectorDB.deleteVectorsByIds(vectorBoxIds);
      }

      await this.purgeUnreferencedProcessedFiles();
      this.log('documents successfully deleted');
      return true;
    } catch (error) {
      console.error('Error deleting documents:', error);
      return false;
    }
  }

  static async delete(where: { field: string, value: string }[] = [], withVectors: boolean = false): Promise<any> {
    try {
      if (!where.length) return true;

      let vectorBoxIds: number[] = [];
      await database.write(async () => {
        const documents = await database.get(Document.table).query(
          where.map(({ field, value }) => Q.where(field, value))
        ).fetch();

        if (documents.length === 0) return;
        this.log(`deleting ${documents.length} documents`, where);
        for (const document of documents) {
          // @ts-ignore
          let documentVectorBoxIds = document._raw.vector_box_ids;
          if (typeof documentVectorBoxIds === 'string') documentVectorBoxIds = JSON.parse(documentVectorBoxIds);
          vectorBoxIds = [...vectorBoxIds, ...(documentVectorBoxIds || [])];
          await document.destroyPermanently();
        }
      });

      if (withVectors) {
        this.log(`deleting ${vectorBoxIds.length} vectors associated with documents`);
        await VectorDB.deleteVectorsByIds(vectorBoxIds);
      }

      await this.purgeUnreferencedProcessedFiles();
      this.log('documents successfully deleted');
      return true;
    } catch (error) {
      console.error('Error deleting documents:', error);
      return false;
    }
  }

  static async deleteAll(withVectors: boolean = false) {
    const documents = await database.get(Document.table).query().fetch() as (Model & DocumentType)[];
    if (!documents || documents.length === 0) return true;
    await database.write(async () => {
      this.log(`deleting ${documents.length} documents`);
      await database.batch(documents.map((document) => document.prepareDestroyPermanently()));
    });
    if (withVectors) await VectorDB.reset();
    await this.purgeUnreferencedProcessedFiles();
  }
}

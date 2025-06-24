import { field, json, text } from '@nozbe/watermelondb/decorators';
import { database } from '@/database';
import { Q, Model } from '@nozbe/watermelondb';
import { generateUUID } from '@/utils/constants';
import VectorDB from '@/utils/VectorDB';

export type DocumentType = {
  name: string;
  uuid: string;
  workspaceSlug: string;
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
  @json('vector_box_ids', sanitizeVectorBoxIds) vectorBoxIds!: number[];
  @field('created_at') createdAt!: number;

  static log(message: any, ...args: any[]) {
    console.log(`\x1b[32m[db:Document]\x1b[0m`, message, ...args) // eslint-disable-line no-console
  }

  static toDocumentObject(data: any): DocumentType {
    const { name, uuid, workspaceSlug, vectorBoxIds, createdAt } = data;
    return {
      name: name,
      uuid: uuid,
      workspaceSlug: workspaceSlug,
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
    vectorBoxIds = [],
  }: {
    name: string;
    workspaceSlug: string;
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
        document.vectorBoxIds = vectorBoxIds;
        document.createdAt = Date.now();
      });
    });
    newDocument = this.toDocumentObject(newDocument);
    this.log(`newDocument created ${newDocument.uuid} - ${newDocument.name}`);
    return newDocument;
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
      await database.batch(documents.map((document) => document.prepareMarkAsDeleted()));
    });
    if (withVectors) await VectorDB.reset();
  }
}

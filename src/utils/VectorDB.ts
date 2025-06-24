import { NativeModules } from 'react-native';
const { VectorBox } = NativeModules;

interface VectorEntity {
    id: number;
    embedding: number[];
    metadata?: string;
    workspaceSlug?: string;
}

export type SemanticSearchResult = {
    id: number;
    metadata: { content?: string, [key: string]: any };
    score: number;
}

interface VectorBoxInterface {
    insert(workspaceSlug: string, embedding: number[], metadata?: string): Promise<number>;
    bulkInsert(workspaceSlug: string, embeddings: { embedding: number[], metadata: string }[]): Promise<number[]>;
    get(id: number): Promise<VectorEntity>;
    update(id: number, embedding: number[], metadata?: string): Promise<boolean>;
    remove(id: number): Promise<boolean>;
    getCount(): Promise<number>;
    workspaceVectorCount(workspaceSlug: string): Promise<number>;
    resetVectorsForWorkspace(workspaceSlug: string): Promise<boolean>;
    semanticSearch(workspaceSlug: string, queryVector: number[], topN: number): Promise<{ id: number, metadata: string, score: number }[]>;
    deleteVectorsByIds(ids: number[]): Promise<boolean>;
    reset(): Promise<boolean>;
}

/**
 * VectorDB is a singleton class that provides a wrapper around the VectorBox native module.
 * It is used to insert, retrieve, and search for vectors in the database.
 * 
 * Since SQLite does not support a fast vector search, we use ObjectBox to store the vectors.
 * ObjectBox is a NoSQL database that supports vector search.
 * 
 * @see https://docs.objectbox.io/
 * @see android/app/src/main/java/com/anythingllm/vectordb/VectorBox.kt
 */
class VectorDB {
    private static instance: VectorDB;
    // @ts-ignore-next-line
    private vectorBox: VectorBoxInterface;

    constructor() {
        if (VectorDB.instance) return VectorDB.instance;
        this.vectorBox = VectorBox;
        VectorDB.instance = this;
    }

    async getVectorCount(): Promise<number> {
        try {
            return await this.vectorBox.getCount();
        } catch (error) {
            console.error('Error getting vector count:', error);
            throw error;
        }
    }

    async getWorkspaceVectorCount(workspaceSlug: string): Promise<number> {
        try {
            return await this.vectorBox.workspaceVectorCount(workspaceSlug);
        } catch (error) {
            console.error('Error getting workspace vector count:', error);
            throw error;
        }
    }

    /**
     * Insert a new vector into the database
     */
    async insertVector(workspaceSlug: string, embedding: number[], metadata: object = {}): Promise<number> {
        try {
            return await this.vectorBox.insert(workspaceSlug, embedding, JSON.stringify(metadata));
        } catch (error) {
            console.error('Error inserting vector:', error);
            throw error;
        }
    }

    /**
     * Bulk insert vectors into the database
     * The metadata will be stringified if it's not already a string prior to insertion
     * Returns an array of vector box ids for the ObjectBox database
     */
    async bulkInsert(workspaceSlug: string, vectors: { embedding: number[], metadata: object }[]): Promise<{ count: number, ids: number[] }> {
        try {
            if (vectors.length === 0) return { count: 0, ids: [] };
            if (!vectors.every(vector => vector.embedding && vector.embedding.length > 0 && vector.metadata)) throw new Error('Invalid vector schema');
            const preparedVectors = vectors.map(vector => ({
                embedding: vector.embedding,
                metadata: typeof vector.metadata === 'string' ? vector.metadata : JSON.stringify(vector.metadata)
            }));

            const result = await this.vectorBox.bulkInsert(workspaceSlug, preparedVectors);
            return { count: result.length, ids: result };
        } catch (error) {
            console.error('Error inserting vectors:', error);
            throw error;
        }
    }

    /**
     * Run a semantic search on the database for a specific workspace
     * with a query vector and return the top N results.
     */
    async runSemanticSearch(workspaceSlug: string, queryVector: number[], topN: number = 2): Promise<SemanticSearchResult[]> {
        try {
            const results = await this.vectorBox.semanticSearch(workspaceSlug, queryVector, topN);
            return results.map((result: { id: number, metadata: string, score: number }) => ({
                id: result.id,
                metadata: JSON.parse(result.metadata),
                score: result.score
            }));
        } catch (error) {
            console.error('Error running semantic search:', error);
            throw error;
        }
    }

    /**
     * Reset all vectors for a specific workspace
     */
    async resetVectorsForWorkspace(workspaceSlug: string): Promise<boolean> {
        try {
            return await this.vectorBox.resetVectorsForWorkspace(workspaceSlug);
        } catch (error) {
            console.error('Error resetting vectors:', error);
            throw error;
        }
    }

    async deleteVectorsByIds(ids: number[]): Promise<boolean> {
        try {
            return await this.vectorBox.deleteVectorsByIds(ids);
        } catch (error) {
            console.error('Error deleting vectors:', error);
            throw error;
        }
    }

    async reset() {
        try {
            return this.vectorBox.reset();
        } catch (error) {
            console.error('Error deleting vectors:', error);
            throw error;
        }
    }
}

export default new VectorDB(); 
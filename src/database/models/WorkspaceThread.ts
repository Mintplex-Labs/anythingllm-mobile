import { field, immutableRelation, relation, text } from '@nozbe/watermelondb/decorators';
import { database } from '@/database';
import slugify from 'slugify';
import { Q, Model, Relation } from '@nozbe/watermelondb';
import { generateUUID } from '@/utils/constants';
import { type WorkspaceType } from './Workspace';
import { type WorkspaceChatType } from './WorkspaceChat';

export type WorkspaceThreadType = {
  name: string;
  workspaceSlug: string;
  slug: string;
  createdAt: number;
};

export default class WorkspaceThread extends Model {
  static table = 'workspace_threads';
  static defaultName = 'New Thread';
  static writableFields = {
    name: {
      validate: (value: string) => {
        let error = '';
        if (typeof value !== 'string') error = 'Name must be a string';
        if (!value) error = 'Name is required';
        if (value.length < 3) error = 'Name must be at least 3 characters long';
        if (value.length > 100) error = 'Name must be less than 100 characters long';
        return { valid: !error, error };
      },
    },
  }

  static associations = {
    workspace: { type: 'belongs_to' as const, key: 'workspace_slug' },
    chats: { type: 'has_many' as const, foreignKey: 'workspace_thread_slug' },
  }

  @text('name') name!: string;
  @text('slug') slug!: string;
  @text('workspace_slug') workspaceSlug!: string;
  @immutableRelation('workspaces', 'workspace_slug') workspace!: Relation<Model & WorkspaceType>;
  @relation('workspace_chats', 'workspace_thread_slug') chats!: Relation<Model & WorkspaceChatType>;
  @field('created_at') createdAt!: number;

  static log(message: any, ...args: any[]) {
    console.log(`\x1b[32m[db:WorkspaceThread]\x1b[0m`, message, ...args) // eslint-disable-line no-console
  }

  static toWorkspaceThreadObject(data: any): WorkspaceThreadType {
    const { name, slug, createdAt, workspaceSlug } = data;
    return {
      name: name,
      slug: slug,
      workspaceSlug,
      createdAt,
    };
  }


  /**
  * Find the first thread by a given set of where clauses
  * @param where - An array of where clauses
  * @returns The first thread with the WorkspaceThreadType interface
  */
  static async first(where: { field: string, value: string }[] = []): Promise<WorkspaceThreadType | null> {
    const thread = await this.get(where);
    if (!thread || thread.length === 0) return null;
    return this.toWorkspaceThreadObject(thread[0]);
  }

  /**
   * Find documents by a given set of where clauses
   * @param where - An array of where clauses
   * @returns An array of documents with the DocumentType interface
   */
  static async find(where: { field: string, value: string }[] = []): Promise<WorkspaceThreadType[]> {
    const threads = await database.get(WorkspaceThread.table).query(
      where.map(({ field, value }) => Q.where(field, value))
    ).fetch();
    return threads.map((thread) => this.toWorkspaceThreadObject(thread));
  }

  /**
   * Returns watermelon db model instances by a given set of where clauses
   */
  static async get(where: { field: string, value: string }[] = []): Promise<Model[] | null> {
    const workspaceThread = await database.get(WorkspaceThread.table).query(
      where.map(({ field, value }) => Q.where(field, value))
    ).fetch();
    if (workspaceThread.length === 0) return null;
    return workspaceThread;
  }

  static async create({ workspaceSlug }: { workspaceSlug: string }): Promise<any> {
    const slug = slugify(generateUUID());

    let newWorkspaceThread: any;
    await database.write(async () => {
      newWorkspaceThread = await database.get(WorkspaceThread.table).create((workspaceThread: any) => {
        workspaceThread.name = 'New Thread';
        workspaceThread.slug = slug;
        workspaceThread.workspaceSlug = workspaceSlug;
        workspaceThread.createdAt = Date.now();
      });
    });

    this.log('WorkspaceThread created', { workspace: workspaceSlug, thread: newWorkspaceThread.slug });
    newWorkspaceThread = this.toWorkspaceThreadObject(newWorkspaceThread);
    return newWorkspaceThread;
  }

  static async update(where: { field: string, value: string }[] = [], updates: Partial<WorkspaceThreadType>): Promise<WorkspaceThreadType | null> {
    try {
      let validatedFields: Partial<WorkspaceThreadType> = {};
      for (const [key, value] of Object.entries(updates)) {
        const validation = WorkspaceThread.writableFields[key].validate(value);
        if (!validation.valid) throw new Error(validation.error);
        validatedFields[key] = value;
      }

      const existingThread = (await this.get(where))?.[0];
      if (!existingThread) throw new Error('Thread not found');

      let updatedThread: any = existingThread;
      await database.write(async () => {
        updatedThread = await existingThread.update((thread: any) => {
          Object.assign(thread, validatedFields);
          return WorkspaceThread.toWorkspaceThreadObject(thread);
        });
      });

      this.log('updated workspace thread', { where, updates });
      return this.toWorkspaceThreadObject(updatedThread);
    } catch (error) {
      console.error('Error updating workspace thread:', error);
      return null;
    }
  }

  static async delete(where: { field: string, value: string }[] = []): Promise<any> {
    try {
      await database.write(async () => {
        const workspaceThread = await database.get(WorkspaceThread.table).query(
          where.map(({ field, value }) => Q.where(field, value))
        ).fetch();
        if (workspaceThread.length === 0) return;

        this.log(`deleting ${workspaceThread.length} workspace threads`);
        await database.batch(workspaceThread.map((thread) => thread.prepareMarkAsDeleted()));
        this.log(`deleted ${workspaceThread.length} workspace threads`);
        return true;
      });
      return true;
    } catch (error) {
      console.error('Error deleting workspace thread:', error);
      return false;
    }
  }
}

import { field, immutableRelation, json, text } from '@nozbe/watermelondb/decorators';
import { database } from '@/database';
import slugify from 'slugify';
import { Q, Model, Relation } from '@nozbe/watermelondb';
import { generateUUID } from '@/utils/constants';
import Workspace, { type WorkspaceType } from './Workspace';
import AnythingLLMExternal from '@/utils/AnythingLLMExternal';
import { showToast } from '@/utils/Notification';

export type WorkspaceThreadType = {
  name: string;
  workspaceSlug: string;
  slug: string;
  createdAt: number;
  isRemote: boolean;
  remoteConfig: {
    wsSlug: string;
    connectionUrl: string;
    deviceToken: string;
    slug: string | null; // fk slug in destination. Null is the default thread.
    platform: 'server' | 'desktop';
  };
  /** Check if the remote server is reachable */
  remoteServerReachable: () => Promise<boolean>;
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
    // WorkspaceChats? relations are really complex so maybe do it later.
  }

  @text('name') name!: string;
  @text('slug') slug!: string;
  @text('workspace_slug') workspaceSlug!: string;
  @immutableRelation('workspaces', 'workspace_slug') workspace!: Relation<Model & WorkspaceType>;
  @field('is_remote') isRemote!: boolean;
  @json('remote_config', (json: any) => json) remoteConfig!: WorkspaceThreadType['remoteConfig'];
  @field('created_at') createdAt!: number;

  static log(message: any, ...args: any[]) {
    console.log(`\x1b[32m[db:WorkspaceThread]\x1b[0m`, message, ...args) // eslint-disable-line no-console
  }

  static toWorkspaceThreadObject(data: any): WorkspaceThreadType {
    const { name, slug, createdAt, workspaceSlug, isRemote = false, remoteConfig = null } = data;
    return {
      name: name,
      slug: slug,
      workspaceSlug,
      isRemote,
      remoteConfig,
      createdAt,
      remoteServerReachable: async (): Promise<boolean> => {
        if (!isRemote || !remoteConfig) return false;
        try {
          const external = new AnythingLLMExternal(remoteConfig.connectionUrl, remoteConfig.deviceToken);
          const response = await external.tokenIsApproved();
          return response;
        } catch (error) {
          return false;
        }
      },
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

  static async create({ workspaceSlug }: { workspaceSlug: string }): Promise<WorkspaceThreadType> {
    const slug = slugify(generateUUID());
    const parentWorkspace = await Workspace.first([{ field: 'slug', value: workspaceSlug }]);
    const creationConfig = {
      name: 'New Thread',
      slug,
      workspaceSlug,
      isRemote: false,
      remoteConfig: null as any,
      createdAt: Date.now(),
    }

    // If the parent workspace is remote, create the thread in the remote workspace as well
    // If the remote instance is not reachable then we will throw an error to keep the threads from being out of sync
    if (parentWorkspace?.isRemote) {
      const externalModule = new AnythingLLMExternal(parentWorkspace.remoteConfig.connectionUrl, parentWorkspace.remoteConfig.deviceToken);
      const parentWorkspaceSlug = parentWorkspace.remoteConfig.slug;
      const { thread: fkThread } = await externalModule.sendCommand('new-thread', { workspaceSlug: parentWorkspaceSlug });
      this.log('Created thread in remote workspace', { fkThread });
      if (!fkThread) {
        showToast("We could not create a thread in your remote workspace. Please check your connection and try again.");
        throw new Error('Failed to create thread in remote workspace');
      }

      creationConfig.isRemote = true;
      creationConfig.remoteConfig = {
        wsSlug: parentWorkspaceSlug,
        connectionUrl: parentWorkspace.remoteConfig.connectionUrl,
        deviceToken: parentWorkspace.remoteConfig.deviceToken,
        platform: parentWorkspace.remoteConfig.platform,
        slug: fkThread.slug,
      }
    }

    let newWorkspaceThread: any;
    await database.write(async () => {
      newWorkspaceThread = await database.get(WorkspaceThread.table).create((workspaceThread: any) => {
        workspaceThread.name = creationConfig.name;
        workspaceThread.slug = creationConfig.slug;
        workspaceThread.workspaceSlug = creationConfig.workspaceSlug;
        workspaceThread.isRemote = creationConfig.isRemote;
        workspaceThread.remoteConfig = creationConfig.remoteConfig;
        workspaceThread.createdAt = creationConfig.createdAt;
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

  static async deleteAll() {
    const threads = await this.get();
    if (!threads || threads.length === 0) return true;
    await database.write(async () => {
      this.log(`deleting ${threads.length} threads`);
      await database.batch(threads.map((thread) => thread.prepareMarkAsDeleted()));
    });
    return true;
  }

  /**
  * Create a workspace thread without the default values
  * @param data - The data to create the workspace with
  * @returns The created workspace
  */
  static async directCreate(data: Partial<WorkspaceThreadType>): Promise<WorkspaceThread> {
    let newWorkspaceThread: any;
    await database.write(async () => {
      newWorkspaceThread = await database.get(WorkspaceThread.table).create((workspaceThread: any) => {
        Object.assign(workspaceThread, data);
        if (!workspaceThread.name) workspaceThread.name = WorkspaceThread.defaultName;
        if (!workspaceThread.slug) workspaceThread.slug = generateUUID();
        if (!workspaceThread.workspaceSlug) workspaceThread.workspaceSlug = data.workspaceSlug;
        if (!workspaceThread.isRemote) workspaceThread.isRemote = data.isRemote ?? false;
        if (!workspaceThread.remoteConfig) workspaceThread.remoteConfig = data.remoteConfig ?? null;
        workspaceThread.created_at = Date.now();
      });
    });
    newWorkspaceThread = this.toWorkspaceThreadObject(newWorkspaceThread);
    return newWorkspaceThread;
  }
}

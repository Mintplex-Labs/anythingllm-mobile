import { field, text } from '@nozbe/watermelondb/decorators';
import { database } from '@/database';
import slugify from 'slugify';
import { Q, Model } from '@nozbe/watermelondb';
import { generateUUID } from '@/utils/constants';
import WorkspaceThread, { WorkspaceThreadType } from './WorkspaceThread';
import VectorDB from '@/utils/VectorDB';

export type WorkspaceType = {
  name: string;
  slug: string;
  createdAt: number;
  systemPrompt: string;
  temperature: number;
  threads?: WorkspaceThreadType[];
};

export default class Workspace extends Model {
  static table = 'workspaces';
  static defaultSystemPrompt = `You are a helpful assistant that can answer questions and help with tasks.`;
  static defaultTemperature = 0.7;

  @text('name') name!: string;
  @text('slug') slug!: string; // unique!!
  @text('system_prompt') systemPrompt!: string;
  @field('temperature') temperature!: number;
  @field('created_at') createdAt!: number;

  static log(message: any, ...args: any[]) {
    console.log(`\x1b[32m[db:Workspace]\x1b[0m`, message, ...args) // eslint-disable-line no-console
  }

  static toWorkspaceObject(data: any): WorkspaceType {
    const { name, slug, createdAt, systemPrompt, temperature } = data;
    return {
      name: name,
      slug: slug,
      systemPrompt,
      temperature,
      createdAt,
      threads: [],
    };
  }

  /**
   * Find a workspace by slug and load all threads associated with it
   * @note This is the preferred way to get a workspace
   * @param slug - The slug of the workspace to find
   * @returns The workspace object
   */
  static async find(slug: string): Promise<WorkspaceType | null> {
    const workspaceBySlug = await database.get(Workspace.table).query(
      Q.where('slug', slug)
    ).fetch();

    if (workspaceBySlug.length === 0) return null;
    const workspace = this.toWorkspaceObject(workspaceBySlug[0]);
    workspace.threads = await WorkspaceThread.getAll(workspace.slug);
    return workspace;
  }

  /**
   * Get a workspace by slug returns the raw WatermelonDB workspace object
   * @note you should use find() instead
   * @param slug - The slug of the workspace to find
   */
  static async get(slug: string): Promise<any> {
    const workspace = await database.get(Workspace.table).query(Q.where('slug', slug)).fetch();
    if (workspace.length === 0) return null;
    return workspace[0];
  }

  static async create({ name }: { name: string }): Promise<any> {
    let slug = slugify(name).toLowerCase();
    let existingWorkspace = await Workspace.find(slug);
    if (existingWorkspace) slug = slugify(name + generateUUID()).toLowerCase();

    let newWorkspace: any;
    await database.write(async () => {
      newWorkspace = await database.get(Workspace.table).create((workspace: any) => {
        workspace.name = name;
        workspace.slug = slug;
        workspace.system_prompt = Workspace.defaultSystemPrompt;
        workspace.temperature = Workspace.defaultTemperature;
        workspace.created_at = Date.now();
      });
    });
    newWorkspace = this.toWorkspaceObject(newWorkspace);

    // Create a new thread for the workspace on creation
    const thread = await WorkspaceThread.create({ workspaceSlug: slug });
    return {
      ...newWorkspace,
      threads: [thread],
    };
  }

  static async delete(wsSlug: string): Promise<any> {
    try {
      if (!wsSlug) return true;

      await database.write(async () => {
        const workspace = await database.get(Workspace.table).query(Q.where('slug', wsSlug)).fetch();
        if (workspace.length === 0) return;
        this.log('deleting workspace', wsSlug);
        await workspace[0].destroyPermanently();
      });

      // Delete all threads for the workspace
      const threads = await WorkspaceThread.getAll(wsSlug);
      if (threads.length > 0) {
        this.log(`Deleting ${threads.length} threads associated with this workspace`);
        for (const thread of threads) await WorkspaceThread.delete(wsSlug, thread.slug);
      }

      // Delete all vectors for the workspace
      await VectorDB.resetVectorsForWorkspace(wsSlug);
      this.log('workspace successfully deleted');
      return true;
    } catch (error) {
      console.error('Error deleting workspace:', error);
      return false;
    }
  }

  static async getAll(withThreads: boolean = false): Promise<any[]> {
    this.log('getAll', { withThreads });
    const workspaces = (await database.get(Workspace.table).query().fetch())
      .map((workspace) => this.toWorkspaceObject(workspace));
    if (!withThreads) return workspaces;

    for (const workspace of workspaces) {
      const threads = await WorkspaceThread.getAll(workspace.slug);
      workspace.threads = threads;
    }

    return workspaces;
  }
}

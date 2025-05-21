import { field, text } from '@nozbe/watermelondb/decorators';
import { database } from '@/database';
import slugify from 'slugify';
import { Q, Model } from '@nozbe/watermelondb';
import { generateUUID } from '@/utils/constants';
import WorkspaceThread, { WorkspaceThreadType } from './WorkspaceThread';

export type WorkspaceType = {
  name: string;
  slug: string;
  createdAt: number;
  threads?: WorkspaceThreadType[];
};

export default class Workspace extends Model {
  static table = 'workspaces';

  @text('name') name!: string;
  @text('slug') slug!: string; // unique!!
  @field('created_at') createdAt!: number;

  static log(message: any, ...args: any[]) {
    console.log(`[db:Workspace]`, message, ...args) // eslint-disable-line no-console
  }

  static toWorkspaceObject(data: any): WorkspaceType {
    const { name, slug, createdAt } = data;
    return {
      name: name,
      slug: slug,
      createdAt,
      threads: [],
    };
  }

  static async find(slug: string): Promise<any> {
    const workspaceBySlug = await database.get(Workspace.table).query(
      Q.where('slug', slug)
    ).fetch();

    if (workspaceBySlug.length === 0) return null;
    const workspace = this.toWorkspaceObject(workspaceBySlug[0]);
    workspace.threads = await WorkspaceThread.getAll(workspace.slug);
    return workspace;
  }

  static async create({ name }: { name: string }): Promise<any> {
    let slug = slugify(name);
    let existingWorkspace = await Workspace.find(slug);
    if (existingWorkspace) slug = slugify(name + generateUUID());

    let newWorkspace: any;
    await database.write(async () => {
      newWorkspace = await database.get(Workspace.table).create((workspace: any) => {
        workspace.name = name;
        workspace.slug = slug;
        workspace.created_at = Date.now();
      });
    });
    newWorkspace = this.toWorkspaceObject(newWorkspace);

    // Create a new thread for the workspace on creation
    await WorkspaceThread.create({ workspaceSlug: slug });
    return newWorkspace;
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

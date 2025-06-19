import { field, text } from '@nozbe/watermelondb/decorators';
import { database } from '@/database';
import slugify from 'slugify';
import { Q, Model } from '@nozbe/watermelondb';
import { generateUUID } from '@/utils/constants';

export type WorkspaceThreadType = {
  name: string;
  workspaceSlug: string;
  slug: string;
  createdAt: number;
};

export default class WorkspaceThread extends Model {
  static table = 'workspace_threads';

  @text('name') name!: string;
  @text('slug') slug!: string;
  @text('workspace_slug') workspaceSlug!: string;
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
   * Returns watermelon db model instance
   */
  static async get(workspaceSlug: string, threadSlug: string): Promise<Model | null> {
    const workspaceThread = await database.get(WorkspaceThread.table).query(
      Q.where('workspace_slug', workspaceSlug),
      Q.where('slug', threadSlug)
    ).fetch();
    if (workspaceThread.length === 0) return null;
    return workspaceThread[0];
  }

  static async find(workspaceSlug: string, threadSlug: string): Promise<any> {
    const workspaceBySlug = await database.get(WorkspaceThread.table).query(
      Q.where('workspace_slug', workspaceSlug),
      Q.where('slug', threadSlug)
    ).fetch();

    if (workspaceBySlug.length === 0) return null;
    return WorkspaceThread.toWorkspaceThreadObject(workspaceBySlug[0]);
  }

  static async create({ workspaceSlug }: { workspaceSlug: string }): Promise<any> {
    const slug = slugify(generateUUID());

    let newWorkspaceThread: any;
    await database.write(async () => {
      newWorkspaceThread = await database.get(WorkspaceThread.table).create((workspaceThread: any) => {
        console.log('newWorkspaceThread', {
          name: 'New Thread',
          workspace: workspaceSlug,
          slug: slug,
          created_at: Date.now(),
        });
        workspaceThread.name = 'New Thread';
        workspaceThread.slug = slug;
        workspaceThread.workspaceSlug = workspaceSlug;
        workspaceThread.createdAt = Date.now();
      });
    });

    this.log('newWorkspaceThread', { workspace: workspaceSlug, thread: newWorkspaceThread.slug });
    newWorkspaceThread = this.toWorkspaceThreadObject(newWorkspaceThread);
    return newWorkspaceThread;
  }

  static async update(workspaceSlug: string, threadSlug: string, data: { name: string }): Promise<any> {
    if (!data.name) return this.log('no name provided', { workspaceSlug, threadSlug, data });

    const existingThread = await this.get(workspaceSlug, threadSlug);
    if (!existingThread) return this.log('thread not found', { workspaceSlug, threadSlug });

    await database.write(async () => {
      await existingThread.update((thread: any) => {
        thread.name = data.name;
      });
    });

    this.log('updated workspace thread', { workspaceSlug, threadSlug, data });
    return true;
  }

  static async delete(workspaceSlug: string, threadSlug: string): Promise<any> {
    await database.write(async () => {
      const workspaceThread = await database.get(WorkspaceThread.table).query(
        Q.where('workspace_slug', workspaceSlug),
        Q.where('slug', threadSlug)).fetch();
      if (workspaceThread.length === 0) return;

      this.log('deleting workspace thread', workspaceSlug, threadSlug);
      await workspaceThread[0].destroyPermanently();
    });
    return true;
  }

  static async getAll(workspaceSlug: string): Promise<any[]> {
    const workspaceThreads = await database.get(WorkspaceThread.table).query(
      Q.where('workspace_slug', workspaceSlug)
    ).fetch();
    if (workspaceThreads.length === 0) return [];
    return workspaceThreads.map((workspaceThread) => this.toWorkspaceThreadObject(workspaceThread));
  }
}

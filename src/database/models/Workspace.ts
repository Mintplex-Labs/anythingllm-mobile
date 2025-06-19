import { field, text } from '@nozbe/watermelondb/decorators';
import { database } from '@/database';
import slugify from 'slugify';
import { Q, Model } from '@nozbe/watermelondb';
import { generateUUID } from '@/utils/constants';
import WorkspaceThread, { WorkspaceThreadType } from './WorkspaceThread';
import Document from './Document';
import uiStore from '@/store/UIStore';

export type WorkspaceType = {
  name: string;
  slug: string;
  createdAt: number;
  systemPrompt: string;
  temperature: number;
  threads?: WorkspaceThreadType[];
};
export type WorkspaceDBType = Model & WorkspaceType;

export default class Workspace extends Model {
  static table = 'workspaces';
  static defaultName = 'New Workspace';
  static defaultSystemPrompt = `You are a helpful assistant that can answer questions and help with tasks.`;
  static defaultTemperature = 0.7;
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
    systemPrompt: {
      validate: (value: string) => {
        let error = '';
        if (typeof value !== 'string') error = 'System prompt must be a string';
        if (!value) error = 'System prompt is required';
        if (value.length < 10) error = 'System prompt must be at least 10 characters long';
        if (value.length > 1000) error = 'System prompt must be less than 1000 characters long';
        return { valid: !error, error };
      },
    },
    temperature: {
      validate: (value: number) => {
        let error = '';
        if (typeof value !== 'number' || isNaN(Number(value))) error = 'Temperature must be a number';
        if (value < 0 || value > 1) error = 'Temperature must be between 0 and 1';
        return { valid: !error, error };
      },
    },
  }

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
  * Find the first workspace by a given set of where clauses
  * @param where - An array of where clauses
  * @returns The first workspace with the WorkspaceType interface
  */
  static async first(where: { field: string, value: string }[] = []): Promise<WorkspaceType | null> {
    const workspace = await this.get(where);
    if (!workspace || workspace.length === 0) return null;
    return this.toWorkspaceObject(workspace[0]);
  }

  /**
   * Find workspaces by a given set of where clauses
   * @param where - An array of where clauses
   * @returns An array of workspaces with the WorkspaceType interface
   */
  static async find(where: { field: string, value: string }[] = [], withThreads: boolean = false): Promise<WorkspaceType[]> {
    const workspaces = await this.get(where);
    if (!workspaces) return [];

    if (withThreads) {
      const workspacesWithThreads = await Promise.all((workspaces).map(async (workspace) => {
        const threads = await WorkspaceThread.find([{ field: 'workspace_slug', value: workspace.slug }]);
        return { ...this.toWorkspaceObject(workspace), threads };
      }));
      return workspacesWithThreads;
    }

    return workspaces.map((workspace) => this.toWorkspaceObject(workspace));
  }

  /**
   * Returns watermelon db model instances by a given set of where clauses
   */
  static async get(where: { field: string, value: string }[] = []): Promise<WorkspaceDBType[] | null> {
    const workspaces = await database.get(Workspace.table).query(
      where.map(({ field, value }) => Q.where(field, value))
    ).fetch();
    if (workspaces.length === 0) return null;
    return workspaces as WorkspaceDBType[];
  }

  static async create({ name }: { name: string }): Promise<any> {
    let slug = slugify(name).toLowerCase();
    let existingWorkspace = await Workspace.first([{ field: 'slug', value: slug }]);
    if (existingWorkspace) slug = slugify(name + generateUUID()).toLowerCase();

    const nameValidation = Workspace.writableFields.name.validate(name);
    if (!nameValidation.valid) throw new Error(nameValidation.error);

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

  static async update(where: { field: string, value: string }[] = [], updates: Partial<WorkspaceType>): Promise<WorkspaceType | null> {
    try {
      const workspace = (await Workspace.get(where))?.[0] as WorkspaceDBType;
      if (!workspace) throw new Error('Workspace not found');

      let validatedFields: Partial<WorkspaceType> = {};
      for (const [key, value] of Object.entries(updates)) {
        const validation = Workspace.writableFields[key].validate(value);
        if (!validation.valid) throw new Error(validation.error);
        validatedFields[key] = value;
      }

      let updatedWorkspace: any = workspace;
      this.log(`updating workspace ${workspace.slug}`, validatedFields);
      await database.write(async () => {
        updatedWorkspace = await workspace.update((ws: any) => {
          Object.assign(ws, validatedFields);
          return Workspace.toWorkspaceObject(ws);
        });
      });

      // Emit the updated workspace to the UI if useWorkspace hook is listening
      uiStore.emitter.emit('workspaceUpdate', { type: 'update', details: { workspace: updatedWorkspace } });
      return updatedWorkspace;
    } catch (error) {
      console.error('Error updating workspace:', error);
      return null;
    }
  }

  static async delete(where: { field: string, value: string }[] = []): Promise<any> {
    try {
      if (where.length === 0) throw new Error('No where clauses provided');

      const workspaces = await this.get(where);
      if (!workspaces || workspaces.length === 0) throw new Error('No workspaces found for query');

      const workspaceSlugs: string[] = workspaces.map((ws) => (ws as WorkspaceDBType).slug);
      await database.write(async () => {
        this.log(`deleting ${workspaces.length} workspaces`, where);
        await database.batch(workspaces.map((ws) => ws.prepareMarkAsDeleted()));
        this.log(`deleted ${workspaces.length} workspaces`, where);
        return true;
      });

      await Promise.all(workspaceSlugs.map((wsSlug) => WorkspaceThread.delete([{ field: 'workspace_slug', value: wsSlug }])));
      await Promise.all(workspaceSlugs.map((wsSlug) => Document.delete([{ field: 'workspace_slug', value: wsSlug }], true)));
      this.log(`${workspaceSlugs.length} workspaces, children threads, and dependent documents/vectors successfully deleted`);
      return true;
    } catch (error) {
      console.error('Error deleting workspace:', error);
      return false;
    }
  }
}

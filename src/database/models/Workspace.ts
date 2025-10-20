import { field, json, lazy, text } from '@nozbe/watermelondb/decorators';
import { database } from '@/database';
import slugify from 'slugify';
import { Q, Model } from '@nozbe/watermelondb';
import { generateUUID } from '@/utils/constants';
import WorkspaceThread, { WorkspaceThreadType } from './WorkspaceThread';
import Document from './Document';
import uiStore from '@/store/UIStore';
import WorkspaceChat from './WorkspaceChat';
import AnythingLLMExternal from '@/utils/AnythingLLMExternal';
import Telemetry from '@/utils/Telemetry';

export type WorkspaceType = {
  name: string;
  slug: string;
  createdAt: number;
  systemPrompt: string;
  temperature: number;
  contextLength: number;
  isRemote: boolean;
  remoteConfig: {
    connectionUrl: string;
    deviceToken: string;
    slug: string; // fk slug in destination
    platform: 'server' | 'desktop';
  };
  threads?: WorkspaceThreadType[];
  /** Check if the remote server is reachable */
  remoteServerReachable: () => Promise<boolean>;
  /** Get the model tag for the workspace from the remote server */
  remoteModelTag: () => Promise<string>;
};

export type WorkspaceDBType = Model & WorkspaceType & {
  threads: {
    fetch: () => Promise<(Model & WorkspaceThreadType)[]>;
  }
};

export default class Workspace extends Model {
  static table = 'workspaces';
  static defaultName = 'New Workspace';
  static defaultSystemPrompt = `You are a helpful assistant that can answer questions and help with tasks.`;

  /**
   * Inherit the default values from the CactusLmWrapper class so no weirdness happens during inference.
   * https://github.com/cactus-compute/cactus/tree/main/react/src/NativeCactus.ts#L10
   */
  static defaultTemperature = 0.7;
  static defaultContextLength = 1024;
  static maxSystemPromptLength = 10_000;

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
        if (value.length > Workspace.maxSystemPromptLength) error = `System prompt must be less than ${Workspace.maxSystemPromptLength} characters long`;
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
    contextLength: {
      validate: (value: number) => {
        let error = '';
        const numValue = Number(value);
        if (typeof value !== 'number' || isNaN(numValue)) error = 'Context length must be a number';
        if (numValue <= 0) error = 'Context length must be greater than 0';
        if (numValue <= 50) error = 'Context length must be greater than 50';
        return { valid: !error, error };
      },
    },
  }

  static associations = {
    threads: { type: 'has_many' as const, foreignKey: 'workspace_slug' },
    // Documents(?) - we usually just fetch by the workspace slug directly and not through the workspace model
  }

  @lazy
  threads = this.collections
    .get('workspace_threads')
    // @ts-ignore
    .query(Q.where('workspace_slug', this.slug));

  @text('name') name!: string;
  @text('slug') slug!: string; // unique!!
  @text('system_prompt') systemPrompt!: string;
  @field('temperature') temperature!: number;
  @field('context_length') contextLength!: number;
  @field('is_remote') isRemote!: boolean;
  @json('remote_config', (json: any) => json) remoteConfig!: WorkspaceType['remoteConfig'];
  @field('created_at') createdAt!: number;

  static log(message: any, ...args: any[]) {
    console.log(`\x1b[32m[db:Workspace]\x1b[0m`, message, ...args) // eslint-disable-line no-console
  }

  static toWorkspaceObject(data: any): WorkspaceType {
    const { name, slug, createdAt, systemPrompt, temperature, contextLength, isRemote = false, remoteConfig = null } = data;
    return {
      name: name,
      slug: slug,
      systemPrompt,
      temperature,
      contextLength,
      isRemote,
      remoteConfig,
      threads: [],
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

      remoteModelTag: async (): Promise<string> => {
        if (!isRemote || !remoteConfig) return '';
        try {
          const external = new AnythingLLMExternal(remoteConfig.connectionUrl, remoteConfig.deviceToken);
          const response = await external.sendCommand('model-tag', { workspaceSlug: remoteConfig.slug });
          return response.model;
        } catch (error) {
          return '';
        }
      },
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
  static async find(where: { field: string, value: any }[] = [], withThreads: boolean = false): Promise<WorkspaceType[]> {
    const workspaces = await this.get(where);
    if (!workspaces) return [];

    if (withThreads) {
      const workspacesWithThreads = await Promise.all((workspaces).map(async (workspace) => {
        const threads = await workspace.threads.fetch().then((threads) => threads.map((thread) => WorkspaceThread.toWorkspaceThreadObject(thread)));
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
        workspace.context_length = Workspace.defaultContextLength;
        workspace.is_remote = false;
        workspace.remote_config = null;
        workspace.created_at = Date.now();
      });
    });
    newWorkspace = this.toWorkspaceObject(newWorkspace);

    // Create a new thread for the workspace on creation
    Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.WORKSPACE_CREATED);
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

      let workspaceThreadSlugs: string[] = [];
      for (const wsSlug of workspaceSlugs) {
        const threads = await WorkspaceThread.get([{ field: 'workspace_slug', value: wsSlug }]);
        if (!threads || threads.length === 0) continue;
        workspaceThreadSlugs.push(...threads.map((t) => (t as WorkspaceThread).slug));
      }

      await Promise.all(workspaceThreadSlugs.map((wsThreadSlug) => WorkspaceChat.delete([{ field: 'workspace_thread_slug', value: wsThreadSlug }])));
      await Promise.all(workspaceThreadSlugs.map((wsThreadSlug) => WorkspaceThread.delete([{ field: 'slug', value: wsThreadSlug }])));
      await Promise.all(workspaceSlugs.map((wsSlug) => Document.delete([{ field: 'workspace_slug', value: wsSlug }], true)));

      this.log(`${workspaceSlugs.length} workspaces, children threads, and dependent documents/vectors successfully deleted`);
      return true;
    } catch (error) {
      console.error('Error deleting workspace:', error);
      return false;
    }
  }

  static async deleteAll() {
    const workspaces = await this.get();
    if (!workspaces || workspaces.length === 0) return true;
    await database.write(async () => {
      this.log(`deleting ${workspaces.length} workspaces`);
      await database.batch(workspaces.map((ws) => ws.prepareMarkAsDeleted()));
    });
    return true;
  }

  /**
   * Create a workspace without the default values
   * @param data - The data to create the workspace with
   * @returns The created workspace
   */
  static async directCreate(data: Partial<WorkspaceType>): Promise<WorkspaceType> {
    let newWorkspace: any;
    await database.write(async () => {
      newWorkspace = await database.get(Workspace.table).create((workspace: any) => {
        Object.assign(workspace, data);
        if (!workspace.name) workspace.name = Workspace.defaultName;
        if (!workspace.slug) workspace.slug = slugify(workspace.name).toLowerCase();
        if (!workspace.system_prompt) workspace.system_prompt = Workspace.defaultSystemPrompt;
        if (!workspace.temperature) workspace.temperature = Workspace.defaultTemperature;
        if (!workspace.context_length) workspace.context_length = Workspace.defaultContextLength;
        if (!workspace.is_remote) workspace.is_remote = data.isRemote ?? false;
        if (!workspace.remote_config) workspace.remote_config = data.remoteConfig ?? null;
        workspace.created_at = Date.now();
      });
    });
    newWorkspace = this.toWorkspaceObject(newWorkspace);
    return newWorkspace;
  }
}

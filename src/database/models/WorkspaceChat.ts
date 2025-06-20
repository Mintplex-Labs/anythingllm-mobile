import { field, json, text } from '@nozbe/watermelondb/decorators';
import { database } from '@/database';
import { Q, Model } from '@nozbe/watermelondb';
import { generateUUID } from '@/utils/constants';
import { DynamicChatMessage } from '@/screens/WorkspaceChat/ChatHistory';

export type IDocumentCitation = {
  type: 'document';
  document: {
    uuid: string;
    name: string;
    chunk: string
    score: number;
  }
}

export type IAgentWebSearchCitation = {
  type: 'web-search';
  reference: {
    url: string;
    content: string;
  };
}

export type IAgentCitation = IAgentWebSearchCitation;
export type IChatCitation = IDocumentCitation | IAgentCitation;
export type WorkspaceChatResponseType = {
  textResponse: string;
  thoughts: string;
  toolCalls: string[];
  metrics: any; // TODO: Can we track this??
  attachments: any[]; // This would be IMAGES, not files - which are embedded on upload
  citations: IChatCitation[];
}

export type WorkspaceChatType = {
  uuid: string;
  workspaceThreadSlug: string;
  prompt: string;
  response: WorkspaceChatResponseType;
  createdAt: number;
};

export default class WorkspaceChat extends Model {
  static table = 'workspace_chats';

  @text('uuid') uuid!: string;
  @text('workspace_thread_slug') workspaceThreadSlug!: string;
  @text('prompt') prompt!: string;
  @json('response', (json) => json) response!: WorkspaceChatResponseType;
  @field('created_at') createdAt!: number;

  static log(message: any, ...args: any[]) {
    console.log(`\x1b[32m[db:WorkspaceChat]\x1b[0m`, message, ...args) // eslint-disable-line no-console
  }

  static toWorkspaceChatObject(data: any): Partial<WorkspaceChatType> {
    const { uuid, prompt, response, createdAt } = data;
    return {
      uuid,
      prompt,
      response,
      createdAt,
    };
  }

  /**
   * Find chats by a given set of where clauses
   * @param where - An array of where clauses
   * @returns An array of chats with the WorkspaceChatType interface
   */
  static async find(where: { field: string, value: string }[] = [], orderBy: { field: string, direction: 'asc' | 'desc' }[] = []): Promise<WorkspaceChatType[]> {
    const chats = await database.get(WorkspaceChat.table).query(
      ...where.map(({ field, value }) => Q.where(field, value)),
      ...orderBy.map(({ field, direction }) => Q.sortBy(field, direction))
    ).fetch();
    return chats.map((chat) => this.toWorkspaceChatObject(chat) as WorkspaceChatType);
  }

  /**
   * Returns watermelon db model instance
   */
  static async get(where: { field: string, value: string }[] = []): Promise<Model | null> {
    const chat = await database.get(WorkspaceChat.table).query(
      where.map(({ field, value }) => Q.where(field, value))
    ).fetch();
    if (chat.length === 0) return null;
    return chat[0];
  }

  static async create(data: Partial<WorkspaceChatType>): Promise<WorkspaceChatType> {
    const { uuid, workspaceThreadSlug, prompt, response } = data;

    let newWorkspaceChat: any;
    await database.write(async () => {
      newWorkspaceChat = await database.get(WorkspaceChat.table).create((workspaceChat: any) => {
        workspaceChat.uuid = uuid ?? generateUUID();
        workspaceChat.workspaceThreadSlug = workspaceThreadSlug;
        workspaceChat.prompt = prompt;
        workspaceChat.response = response;
        workspaceChat.createdAt = Date.now();
      });
    });

    this.log('newWorkspaceChat', { workspaceThreadSlug, uuid });
    newWorkspaceChat = this.toWorkspaceChatObject(newWorkspaceChat);
    return newWorkspaceChat;
  }

  /**
   * Delete a workspace chat by a given set of where clauses
   * @param where - An array of where clauses
   * @returns True if the chats were deleted, false otherwise
   */
  static async delete(where: { field: string, value: string }[] = []): Promise<boolean> {
    try {
      return await database.write(async () => {
        const chat = await database.get(WorkspaceChat.table).query(
          where.map(({ field, value }) => Q.where(field, value))
        ).fetch() as (Model & WorkspaceChatType)[];
        if (chat.length === 0) return false;

        this.log(`preparing to delete ${chat.length} workspace chats`);
        await database.batch(chat.map((chat) => chat.prepareMarkAsDeleted()));
        this.log(`deleted ${chat.length} workspace chats`);
        return true;
      });
    } catch (error) {
      this.log('error deleting workspace chats', error);
      return false;
    }
  }

  /**
   * Create a new chat with a given prompt for placeholder purposes
   * @param data - The data for the new chat
   */
  static newChatItem(data: { workspaceThreadSlug: string, prompt: string }): Partial<DynamicChatMessage> & { workspaceThreadSlug: string } {
    if (!data.workspaceThreadSlug) throw new Error('Workspace thread slug is required');
    if (!data.prompt) throw new Error('Prompt is required');
    return {
      uuid: generateUUID(),
      workspaceThreadSlug: data.workspaceThreadSlug,
      prompt: data.prompt,
      response: {
        textResponse: '',
        thoughts: '',
        toolCalls: [],
        metrics: {},
        attachments: [],
        citations: [],
      },
      createdAt: Date.now(),
      isLoading: true,
    };
  }
}

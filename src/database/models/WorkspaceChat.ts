import { field, json, text, immutableRelation } from '@nozbe/watermelondb/decorators';
import { database } from '@/database';
import { Q, Model } from '@nozbe/watermelondb';
import WorkspaceThread, { type WorkspaceThreadType } from './WorkspaceThread';

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
  attachments: any[];
  citations: IChatCitation[];
}

export type WorkspaceChatType = {
  uuid: string;
  workspaceThread: WorkspaceThreadType;
  prompt: string;
  response: WorkspaceChatResponseType;
  createdAt: number;
};

export default class WorkspaceChat extends Model {
  static table = 'workspace_chats';

  @text('uuid') uuid!: string;
  @immutableRelation(WorkspaceThread.table, 'slug') workspaceThread!: WorkspaceThreadType;
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
  static async find(where: { field: string, value: string }[] = []): Promise<WorkspaceChatType[]> {
    const chats = await database.get(WorkspaceChat.table).query(
      where.map(({ field, value }) => Q.where(field, value))
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

  static async create(data: Partial<WorkspaceChatType & { workspaceThreadSlug: string }>): Promise<WorkspaceChatType> {
    const { uuid, workspaceThreadSlug, prompt, response } = data;

    let newWorkspaceChat: any;
    await database.write(async () => {
      newWorkspaceChat = await database.get(WorkspaceChat.table).create((workspaceChat: any) => {
        workspaceChat.uuid = uuid;
        workspaceChat.workspaceThread = workspaceThreadSlug;
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
}

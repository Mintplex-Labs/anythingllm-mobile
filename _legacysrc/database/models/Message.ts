import {Model} from '@nozbe/watermelondb';
import {field, text} from '@nozbe/watermelondb/decorators';
import {MessageType, User} from '../../utils/types';

export default class Message extends Model {
  static table = 'messages';

  static associations = {
    chat_sessions: {type: 'belongs_to' as const, key: 'session_id'},
  };

  @text('session_id') sessionId!: string;
  @text('author') author!: string;
  @text('text') text?: string;
  @text('type') type!: string;
  @field('created_at') createdAt!: number;
  @field('metadata') metadata!: string;
  @field('position') position!: number;

  toMessageObject(): MessageType.Any {
    const metadata = JSON.parse(this.metadata || '{}');

    const author: User = {
      id: this.author,
      ...(metadata.authorData || {}),
    };

    if (this.type === 'text') {
      return {
        id: this.id,
        type: 'text',
        text: this.text || '',
        author,
        createdAt: this.createdAt,
        metadata,
      } as MessageType.Text;
    }

    return {
      id: this.id,
      type: this.type as any,
      author,
      createdAt: this.createdAt,
      metadata,
    } as any;
  }
}

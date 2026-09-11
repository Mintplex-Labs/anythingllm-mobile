import { generatedWithLine, formatExportDate, type ThreadExportContext } from './types';

const DIVIDER = '-'.repeat(48);

/**
 * Plain text transcript of a thread.
 * Only the visible user prompt and assistant reply are included - thoughts,
 * tool calls and citations are left out so the file reads like a conversation.
 */
export function buildThreadText(ctx: ThreadExportContext): string {
  const { workspace, thread, chats, modelName, exportedAt } = ctx;
  const lines: string[] = [];

  lines.push(thread.name);
  lines.push('='.repeat(Math.max(thread.name.length, 12)));
  lines.push(`Workspace: ${workspace.name}`);
  lines.push(`Exported: ${formatExportDate(exportedAt)}`);
  lines.push('');

  if (chats.length === 0) lines.push('(This thread has no messages)');

  for (const chat of chats) {
    lines.push('User:');
    lines.push(chat.prompt?.trim() || '(empty)');
    lines.push('');
    lines.push('Assistant:');
    lines.push(chat.response?.textResponse?.trim() || '(no response)');
    lines.push('');
    lines.push(DIVIDER);
    lines.push('');
  }

  lines.push(generatedWithLine(modelName));
  lines.push('Exported from AnythingLLM Mobile');
  return lines.join('\n');
}

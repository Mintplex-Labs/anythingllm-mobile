import { generatedWithLine, formatExportDate, type ThreadExportContext } from './types';

/**
 * Markdown transcript of a thread.
 * Assistant replies are already markdown so they are written through untouched.
 * Like the plain text export, only the visible prompt and reply are included so
 * the document reads like a conversation when rendered.
 */
export function buildThreadMarkdown(ctx: ThreadExportContext): string {
  const { workspace, thread, chats, modelName, exportedAt } = ctx;
  const lines: string[] = [];

  lines.push(`# ${thread.name}`);
  lines.push('');
  lines.push(`**Workspace:** ${workspace.name}  `);
  lines.push(`**Exported:** ${formatExportDate(exportedAt)}`);
  lines.push('');

  if (chats.length === 0) lines.push('_This thread has no messages._');

  for (const chat of chats) {
    lines.push('## User');
    lines.push('');
    lines.push(chat.prompt?.trim() || '_(empty)_');
    lines.push('');
    lines.push('## Assistant');
    lines.push('');
    lines.push(chat.response?.textResponse?.trim() || '_(no response)_');
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push(`_${generatedWithLine(modelName)}_  `);
  lines.push('_Exported from AnythingLLM Mobile_');
  return lines.join('\n');
}

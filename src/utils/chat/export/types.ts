import { type WorkspaceType } from '@/database/models/Workspace';
import { type WorkspaceThreadType } from '@/database/models/WorkspaceThread';
import { type WorkspaceChatType } from '@/database/models/WorkspaceChat';

export type ExportFormat = 'txt' | 'json' | 'pdf';

/**
 * Everything an exporter needs to build a transcript. Built once by the UI and
 * handed to whichever format the user picked so all three formats agree on what
 * a "thread" is.
 */
export type ThreadExportContext = {
  workspace: WorkspaceType;
  thread: WorkspaceThreadType;
  /** Chats in chronological order (oldest first) */
  chats: WorkspaceChatType[];
  /** Human readable model name the thread was generated with - null when unknown */
  modelName: string | null;
  /** Wall-clock ms the export was requested */
  exportedAt: number;
};

export type ExportFormatDefinition = {
  format: ExportFormat;
  label: string;
  extension: string;
  mimeType: string;
  description: string;
};

export const EXPORT_FORMATS: Record<ExportFormat, ExportFormatDefinition> = {
  txt: {
    format: 'txt',
    label: 'Text',
    extension: 'txt',
    mimeType: 'text/plain',
    description: 'Plain text transcript',
  },
  json: {
    format: 'json',
    label: 'JSON',
    extension: 'json',
    mimeType: 'application/json',
    description: 'Messages with model and metrics',
  },
  pdf: {
    format: 'pdf',
    label: 'PDF',
    extension: 'pdf',
    mimeType: 'application/pdf',
    description: 'Formatted document',
  },
};

/** The line appended to the bottom of every transcript */
export function generatedWithLine(modelName: string | null): string {
  return modelName ? `Chats generated with ${modelName}` : 'Chats generated with AnythingLLM';
}

export function formatExportDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

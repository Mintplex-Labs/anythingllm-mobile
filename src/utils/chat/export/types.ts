import { type WorkspaceType } from '@/database/models/Workspace';
import { type WorkspaceThreadType } from '@/database/models/WorkspaceThread';
import { type WorkspaceChatType } from '@/database/models/WorkspaceChat';
import i18n from '@/i18n';

export type ExportFormat = 'txt' | 'md' | 'json' | 'pdf';

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

// `label`/`description` are getters so they are translated when the export menu renders.
export const EXPORT_FORMATS: Record<ExportFormat, ExportFormatDefinition> = {
  txt: {
    format: 'txt',
    get label() { return i18n.t('files.export.text_label'); },
    extension: 'txt',
    mimeType: 'text/plain',
    get description() { return i18n.t('files.export.txt_description'); },
  },
  md: {
    format: 'md',
    label: 'Markdown',
    extension: 'md',
    mimeType: 'text/markdown',
    get description() { return i18n.t('files.export.md_description'); },
  },
  json: {
    format: 'json',
    label: 'JSON',
    extension: 'json',
    mimeType: 'application/json',
    get description() { return i18n.t('files.export.json_description'); },
  },
  pdf: {
    format: 'pdf',
    label: 'PDF',
    extension: 'pdf',
    mimeType: 'application/pdf',
    get description() { return i18n.t('files.export.pdf_description'); },
  },
};

/** The line appended to the bottom of every transcript */
export function generatedWithLine(modelName: string | null): string {
  return modelName ? `Chats generated with ${modelName}` : 'Chats generated with AnythingLLM';
}

export function formatExportDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

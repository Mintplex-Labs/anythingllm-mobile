import { GENERATED_FILE_TYPES, sanitizeFilename } from "@/utils/documents/shared";
import { DOCX_MARGIN_NAMES, DOCX_THEME_NAMES, buildDocxBase64, resolveDocxTitle } from "@/utils/documents/docx";
import { saveGeneratedDocument } from "@/utils/fs/generatedDocuments";
import { generatedFileResult, parseToolArgs, reportGeneratedFile, type StreamEmitter } from "./shared";

type Args = {
    filename: string;
    content: string;
    title?: string;
    subtitle?: string;
    author?: string;
    theme?: string;
    margins?: string;
    includeTitlePage?: boolean;
};

/**
 * Markdown -> Word document. Mirrors the desktop `create-docx-file` plugin: colour themes,
 * margin presets, optional cover page, running header and a "Page X of Y" footer.
 */
export default {
    id: 'createDocxFile',
    name: 'Word Document',
    description: 'Write a styled .docx from markdown with themes and an optional title page.',
    defaultEnabled: false,
    category: 'default',
    group: 'createFiles',
    supportsOnDevice: true,
    definition: {
        type: 'function',
        function: {
            name: 'create_docx_file',
            description:
                'Create a downloadable Microsoft Word document (.docx) from markdown or plain text content. ' +
                'Supports headings, bold/italic, lists, code blocks, tables and quotes, plus a colour theme, ' +
                'page margins and an optional title page with subtitle and author.',
            parameters: {
                type: 'object',
                properties: {
                    filename: {
                        type: 'string',
                        description: 'The filename for the document eg: "project-proposal.docx". The .docx extension is added if missing.',
                    },
                    title: {
                        type: 'string',
                        description: 'Document title used for metadata, the running header and the title page. Defaults to the first heading.',
                    },
                    subtitle: {
                        type: 'string',
                        description: 'Optional subtitle shown on the title page.',
                    },
                    author: {
                        type: 'string',
                        description: 'Optional author name shown on the title page.',
                    },
                    content: {
                        type: 'string',
                        description: 'The full markdown content of the document.',
                    },
                    theme: {
                        type: 'string',
                        enum: [...DOCX_THEME_NAMES],
                        description: "Colour theme: 'neutral' (slate), 'blue' (corporate) or 'warm' (earthy). Defaults to neutral.",
                    },
                    margins: {
                        type: 'string',
                        enum: [...DOCX_MARGIN_NAMES],
                        description: "Page margins: 'normal', 'narrow' (data heavy) or 'wide' (letters and memos). Defaults to normal.",
                    },
                    includeTitlePage: {
                        type: 'boolean',
                        description: 'Whether to add a title page before the content. Defaults to false.',
                    },
                },
                required: ['filename', 'content'],
            },
        },
    },
    config: {},
    execute: async function (args: unknown, streamEmitter: StreamEmitter): Promise<string> {
        try {
            const { filename, content, title, subtitle, author, theme, margins, includeTitlePage } = parseToolArgs<Args>(args, { filename: 'document.docx', content: '' });
            if (!String(content ?? '').trim()) return 'No content provided. No Word document was created.';

            const displayFilename = sanitizeFilename(filename, 'docx', 'document');
            const resolvedTitle = resolveDocxTitle({ title, content, fallbackTitle: displayFilename.replace(/\.docx$/i, '') });

            streamEmitter('report_status', `Creating Word document "${displayFilename}"`);
            const base64 = await buildDocxBase64({ content, title: resolvedTitle, subtitle, author, theme, margins, includeTitlePage: !!includeTitlePage });
            const saved = await saveGeneratedDocument({ fileType: 'docx', extension: 'docx', displayFilename, content: base64, encoding: 'base64' });
            reportGeneratedFile(streamEmitter, saved, GENERATED_FILE_TYPES.docx.mimeType);
            streamEmitter('report_status', `Created ${displayFilename}`);

            const styleInfo = [
                theme && theme !== 'neutral' ? `${theme} theme` : null,
                margins && margins !== 'normal' ? `${margins} margins` : null,
                includeTitlePage ? 'title page' : null,
            ].filter(Boolean);
            return generatedFileResult('Word document', saved, styleInfo.length ? ` with ${styleInfo.join(', ')}` : '');
        } catch (e) {
            console.error(`Create DOCX Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error creating the Word document: ${e instanceof Error ? e.message : 'Unknown error'}`;
        }
    },
} as const;

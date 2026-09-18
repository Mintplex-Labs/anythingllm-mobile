import { GENERATED_FILE_TYPES, sanitizeFilename } from "@/utils/documents/shared";
import { markdownToPdfBase64 } from "@/utils/documents/pdf";
import { firstHeading, lexMarkdown } from "@/utils/documents/markdown";
import { saveGeneratedDocument } from "@/utils/fs/generatedDocuments";
import { generatedFileResult, parseToolArgs, reportGeneratedFile, type StreamEmitter } from "./shared";

type Args = { filename: string; content: string; title?: string };

/**
 * Markdown -> PDF using the same renderer as the thread exporter. Mirrors the desktop
 * `create-pdf-file` plugin.
 */
export default {
    id: 'createPdfFile',
    name: 'PDF Document',
    description: 'Turn markdown or plain text into a formatted PDF.',
    defaultEnabled: false,
    category: 'default',
    group: 'createFiles',
    supportsOnDevice: true,
    definition: {
        type: 'function',
        function: {
            name: 'create_pdf_file',
            description:
                'Create a downloadable PDF document from markdown or plain text content. ' +
                'Supports headings (#, ##, ###), bold, italic, lists, code blocks, tables and quotes. ' +
                'Write the complete document content - it is rendered exactly as given.',
            parameters: {
                type: 'object',
                properties: {
                    filename: {
                        type: 'string',
                        description: 'The filename for the PDF eg: "quarterly-report.pdf". The .pdf extension is added if missing.',
                    },
                    title: {
                        type: 'string',
                        description: 'Optional document title for the PDF metadata. Defaults to the first heading.',
                    },
                    content: {
                        type: 'string',
                        description: 'The full markdown or plain text content of the document.',
                    },
                },
                required: ['filename', 'content'],
            },
        },
    },
    config: {},
    execute: async function (args: unknown, streamEmitter: StreamEmitter): Promise<string> {
        try {
            const { filename, content, title } = parseToolArgs<Args>(args, { filename: 'document.pdf', content: '' });
            if (!String(content ?? '').trim()) return 'No content provided. No PDF was created.';

            const displayFilename = sanitizeFilename(filename, 'pdf', 'document');
            const resolvedTitle = title?.trim() || firstHeading(lexMarkdown(content)) || displayFilename.replace(/\.pdf$/i, '');

            streamEmitter('report_status', `Creating PDF "${displayFilename}"`);
            const base64 = await markdownToPdfBase64({ content, title: resolvedTitle });
            const saved = await saveGeneratedDocument({ fileType: 'pdf', extension: 'pdf', displayFilename, content: base64, encoding: 'base64' });
            reportGeneratedFile(streamEmitter, saved, GENERATED_FILE_TYPES.pdf.mimeType);
            streamEmitter('report_status', `Created ${displayFilename}`);
            return generatedFileResult('PDF document', saved);
        } catch (e) {
            console.error(`Create PDF Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error creating the PDF: ${e instanceof Error ? e.message : 'Unknown error'}`;
        }
    },
} as const;

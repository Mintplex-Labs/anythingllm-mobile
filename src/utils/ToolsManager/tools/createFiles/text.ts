import { GENERATED_FILE_TYPES, extensionOf, sanitizeFilename } from "@/utils/documents/shared";
import { saveGeneratedDocument } from "@/utils/fs/generatedDocuments";
import { generatedFileResult, parseToolArgs, reportGeneratedFile, type StreamEmitter } from "./shared";

const EXTENSIONS = ['txt', 'md', 'csv', 'json'] as const;
type TextExtension = (typeof EXTENSIONS)[number];

type Args = { filename: string; extension: string; content: string };

/**
 * Plain-text style files: .txt, .md, .csv and .json. Mirrors the desktop `create-text-file`
 * plugin with the extension list narrowed to what phones can open and share sensibly.
 */
export default {
    id: 'createTextFile',
    name: 'Text, Markdown & CSV',
    description: 'Write .txt, .md, .csv and .json files from the conversation.',
    defaultEnabled: false,
    category: 'default',
    group: 'createFiles',
    supportsOnDevice: true,
    definition: {
        type: 'function',
        function: {
            name: 'create_text_file',
            description:
                'Create a downloadable text-based file with arbitrary content. ' +
                'Provide the full file content and an extension (defaults to txt). ' +
                'Use md for markdown notes, csv for tabular data, json for structured data.',
            parameters: {
                type: 'object',
                properties: {
                    filename: {
                        type: 'string',
                        description: 'The filename for the file eg: "meeting-notes.txt". If the name has no extension the extension parameter is used.',
                    },
                    extension: {
                        type: 'string',
                        description: 'The file extension without the dot. Defaults to txt.',
                        enum: [...EXTENSIONS],
                    },
                    content: {
                        type: 'string',
                        description: 'The complete text content to write to the file. Can be multi-line.',
                    },
                },
                required: ['filename', 'content'],
            },
        },
    },
    config: { extensions: EXTENSIONS },
    execute: async function (args: unknown, streamEmitter: StreamEmitter): Promise<string> {
        try {
            const { filename, extension, content } = parseToolArgs<Args>(args, { filename: 'document.txt', extension: 'txt', content: '' });
            if (!String(content ?? '').length) return 'No content provided. No file was created.';

            const requested = String(extension ?? '').toLowerCase().replace(/^\./, '');
            const fromName = extensionOf(filename);
            const resolved = (EXTENSIONS.includes(fromName as TextExtension) ? fromName : EXTENSIONS.includes(requested as TextExtension) ? requested : 'txt') as TextExtension;
            const displayFilename = sanitizeFilename(filename, resolved, 'document');
            const fileType = GENERATED_FILE_TYPES[resolved];

            streamEmitter('report_status', `Creating ${displayFilename}`);
            const saved = await saveGeneratedDocument({ fileType: 'text', extension: resolved, displayFilename, content: String(content), encoding: 'utf8' });
            reportGeneratedFile(streamEmitter, saved, fileType.mimeType);
            streamEmitter('report_status', `Created ${displayFilename}`);
            return generatedFileResult(`${fileType.label.toLowerCase()} file`, saved);
        } catch (e) {
            console.error(`Create Text File Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error creating the text file: ${e instanceof Error ? e.message : 'Unknown error'}`;
        }
    },
} as const;

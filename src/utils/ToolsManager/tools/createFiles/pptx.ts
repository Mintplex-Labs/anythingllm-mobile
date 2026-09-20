import { GENERATED_FILE_TYPES, sanitizeFilename, stripInvalidXmlChars } from "@/utils/documents/shared";
import { PPTX_THEME_NAMES, buildPptxBase64, getPptxTheme, type PptxSlide } from "@/utils/documents/pptx";
import { saveGeneratedDocument } from "@/utils/fs/generatedDocuments";
import ToolApproval from "@/utils/ToolsManager/toolApproval";
import { isOnDeviceProvider } from "@/utils/ToolsManager/providerGuards";
import { type ToolExecutionContext } from "@/utils/ToolsManager";
import { isAbortError, throwIfAborted } from "@/utils/chat/abort";
import { generatedFileResult, getConfiguredLLMProvider, parseToolArgs, reportGeneratedFile, type StreamEmitter } from "./shared";
import { buildSectionSlides, type PresentationSection } from "./sectionBuilder";

type Args = {
    filename: string;
    title: string;
    author?: string;
    theme?: string;
    sections: PresentationSection[];
};

const MAX_SECTIONS = 12;

/**
 * Outline -> PowerPoint deck. Mirrors the desktop `create-pptx-presentation` plugin: the parent
 * model plans the sections, each section is expanded by a focused LLM call (see
 * `sectionBuilder`), and the slides are assembled into a themed .pptx.
 *
 * Not available with the on-device provider: every section costs a full completion and the
 * small context windows of on-device models cannot hold the structured output reliably. The
 * tool is pruned from the model's tool list there (`ToolsManager.getTools`) and, in case that
 * ever changes, `execute` refuses as well.
 */
export default {
    id: 'createPptxPresentation',
    name: 'PowerPoint Presentation',
    description: 'Plan and build a themed .pptx deck, one section at a time.',
    defaultEnabled: false,
    category: 'default',
    group: 'createFiles',
    supportsOnDevice: false,
    definition: {
        type: 'function',
        function: {
            name: 'create_pptx_presentation',
            description:
                'Create a downloadable PowerPoint presentation (.pptx). ' +
                'Provide a title, a theme and an outline of sections with key points. ' +
                'Each section is expanded into 2-5 slides with speaker notes by a focused section builder, ' +
                'so give each section the key points and any specific instructions it needs.',
            parameters: {
                type: 'object',
                properties: {
                    filename: {
                        type: 'string',
                        description: 'The filename for the presentation eg: "project-updates.pptx". The .pptx extension is added if missing.',
                    },
                    title: {
                        type: 'string',
                        description: 'The title of the presentation, shown on the title slide.',
                    },
                    author: {
                        type: 'string',
                        description: 'Optional author or presenter name shown on the title slide.',
                    },
                    theme: {
                        type: 'string',
                        enum: [...PPTX_THEME_NAMES],
                        description: `Colour theme for the deck. Options: ${PPTX_THEME_NAMES.join(', ')}. Defaults to default.`,
                    },
                    sections: {
                        type: 'array',
                        description: 'Section outlines in presentation order. Each is expanded into its own slides.',
                        items: {
                            type: 'object',
                            properties: {
                                title: { type: 'string', description: 'The section title.' },
                                keyPoints: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Key points this section should cover. They are expanded into detailed slides.',
                                },
                                instructions: {
                                    type: 'string',
                                    description: "Optional guidance for the section builder eg: 'include a comparison table', 'keep it high level'.",
                                },
                            },
                            required: ['title'],
                        },
                    },
                },
                required: ['filename', 'title', 'sections'],
            },
        },
    },
    config: { maxSections: MAX_SECTIONS },
    execute: async function (args: unknown, streamEmitter: StreamEmitter, context: ToolExecutionContext = {}): Promise<string> {
        try {
            if (await isOnDeviceProvider()) {
                return 'The presentation tool is not available with on-device models. Ask the user to switch to a cloud model provider to create presentations.';
            }

            const parsed = parseToolArgs<Args>(args, { filename: 'presentation.pptx', title: 'Untitled Presentation', sections: [] });
            const title = stripInvalidXmlChars(parsed.title ?? '').trim() || 'Untitled Presentation';
            const author = stripInvalidXmlChars(parsed.author ?? '').trim();
            const theme = getPptxTheme(parsed.theme);
            const sections = (Array.isArray(parsed.sections) ? parsed.sections : [])
                .filter(section => section && typeof section === 'object' && String(section.title ?? '').trim())
                .map(section => ({
                    title: stripInvalidXmlChars(String(section.title)).trim(),
                    keyPoints: Array.isArray(section.keyPoints) ? section.keyPoints.map(point => stripInvalidXmlChars(String(point))).filter(Boolean) : [],
                    instructions: section.instructions ? stripInvalidXmlChars(String(section.instructions)) : undefined,
                }))
                .slice(0, MAX_SECTIONS);
            if (!sections.length) return 'No sections provided. Provide at least one section with a title and key points. No presentation was created.';

            const displayFilename = sanitizeFilename(parsed.filename, 'pptx', 'presentation');
            const total = sections.length;
            streamEmitter('report_status', `Planning presentation "${title}" - ${total} section${total !== 1 ? 's' : ''}, ${theme.name} theme`);

            // Ask before kicking off one LLM round-trip per section
            const approval = await ToolApproval.request({
                skillName: this.definition.function.name,
                description: `Create the PowerPoint presentation "${title}" with ${total} section${total !== 1 ? 's' : ''}? Each section takes a model call to build.`,
                payload: { filename: displayFilename, title, theme: theme.name, sections: sections.map(section => section.title) },
                streamEmitter,
                signal: context.signal,
                autoApprove: context.autoApproveTools,
            });
            if (!approval.approved) {
                streamEmitter('report_status', 'Presentation was not approved');
                return `${approval.message} The presentation was not created.`;
            }

            const llmProvider = await getConfiguredLLMProvider();
            const allSlides: PptxSlide[] = [];
            for (const [index, section] of sections.entries()) {
                throwIfAborted(context.signal);
                streamEmitter('report_status', `[${index + 1}/${total}] Building section "${section.title}"`);
                const { slides, usedFallback } = await buildSectionSlides({ llmProvider, section, presentationTitle: title });
                allSlides.push(...slides);
                streamEmitter('report_status', `[${index + 1}/${total}] Section "${section.title}" complete - ${slides.length} slide${slides.length !== 1 ? 's' : ''}${usedFallback ? ' (from outline)' : ''}`);
            }
            throwIfAborted(context.signal);

            streamEmitter('report_status', `Assembling deck - ${allSlides.length} slides`);
            const base64 = await buildPptxBase64({ title, author, theme: parsed.theme, slides: allSlides });
            const saved = await saveGeneratedDocument({ fileType: 'pptx', extension: 'pptx', displayFilename, content: base64, encoding: 'base64' });
            reportGeneratedFile(streamEmitter, saved, GENERATED_FILE_TYPES.pptx.mimeType);
            streamEmitter('report_status', `Created ${displayFilename}`);
            return generatedFileResult('presentation', saved, ` with ${allSlides.length} slides across ${total} sections using the ${theme.name} theme`);
        } catch (e) {
            if (isAbortError(e)) throw e; // the user stopped the reply - let the chat handler treat it as a stop
            console.error(`Create PPTX Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error creating the presentation: ${e instanceof Error ? e.message : 'Unknown error'}`;
        }
    },
} as const;

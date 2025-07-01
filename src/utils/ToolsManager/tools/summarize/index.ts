import { IAgentWebSearchCitation, IDocumentCitation } from "@/database/models/WorkspaceChat";
import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { getOrigin, safeJsonParse } from "@/utils/formatters";
import webscraper from "@/utils/ToolsManager/tools/webScraping/webscraper";
import TextSplitter from "@/utils/TextSplitter";
import uiStore from "@/store/UIStore";
import { searchProcessedFilesFor } from "@/utils/fs";
import { generateUUID } from "@/utils/constants";

/*
 TODO: Implement file reading
 We cannot read arbitrary files on the device in the Documents folder due to sensitive permissions required
 Instead we can dupe files uploaded to the workspace in a local folder and then we will have access to them there since it
 would then be an application folder file

 So for now, we will only support url input.
*/

export default {
    id: 'summarization',
    name: 'Summarization',
    description: 'Summarize content from a given URL or filename.',
    defaultEnabled: true,
    category: 'default',
    definition: {
        type: 'function',
        function: {
            name: 'summarize',
            description: 'Summarize content from a given URL or filename. Returns the summary of the content.',
            parameters: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        description: 'The type of input to summarize.',
                        enum: ['url', 'filename'],
                    },
                    input: {
                        type: 'string',
                        description: 'The URL of the website to summarize or the name of the file to summarize.',
                    },
                },
                required: ['type', 'input'],
            },
        },
    },
    config: {
        validTypes: ['url', 'filename'],
        chunkSize: 2048, // Smaller chunks for better summarization
        chunkOverlap: 200, // Overlap to maintain context between chunks
        maxChunks: 10,
    },
    execute: async function (args: string, streamEmitter: (event: IStreamEvent, data: any) => void): Promise<string> {
        try {
            const { type, input } = safeJsonParse(args, { type: 'unknown', input: '' }) as { type: string, input: string };
            if (!type || !input) return `No input provided. No results were found.`;
            if (!this.config.validTypes.includes(type as any)) return `Invalid type provided. Valid types are: ${this.config.validTypes.join(', ')}`;

            let contentToSummarize = '';
            let citation: IAgentWebSearchCitation | IDocumentCitation | null = null;

            if (type === 'url') {
                const scrapeResult = await webscraper.scrape(input);
                contentToSummarize = scrapeResult.content;
                citation = {
                    type: 'web-search',
                    reference: {
                        title: scrapeResult?.title ?? getOrigin(input),
                        url: scrapeResult?.url ?? input,
                        content: scrapeResult?.content?.length > 1000 ? scrapeResult.content.substring(0, 1000) + '...' : scrapeResult?.content ?? '',
                    },
                } as IAgentWebSearchCitation;
            }

            if (type === 'filename') {
                contentToSummarize = await searchProcessedFilesFor(input, 'fuzzy') ?? '';
                citation = {
                    type: 'document',
                    document: {
                        uuid: generateUUID(),
                        name: input,
                        chunk: contentToSummarize,
                    },
                } as IDocumentCitation;
            }

            if (!contentToSummarize?.trim()) return `No content found to summarize.`;

            const llmProvider = await this._getLLMProvider();
            if (!llmProvider) return `Error: Could not initialize LLM provider for summarization.`;

            // Split content into manageable chunks
            streamEmitter('report_in_progress_thought', 'Analyzing document structure...');
            const textSplitter = new TextSplitter({
                chunkSize: this.config.chunkSize,
                chunkOverlap: this.config.chunkOverlap,
                chunkHeaderMeta: null
            });

            const textChunks = await textSplitter.splitText(contentToSummarize);
            const limitedChunks = textChunks.slice(0, this.config.maxChunks);
            if (limitedChunks.length !== textChunks.length) streamEmitter('report_in_progress_thought', `Document was very long. Processing first ${limitedChunks.length} sections for summary.`);
            const finalSummary = await this._createHierarchicalSummary(limitedChunks, llmProvider, streamEmitter);
            streamEmitter('report_in_progress_thought', 'Summary complete!');
            if (citation) streamEmitter('report_citations', [citation]);

            return finalSummary;
        } catch (e) {
            console.error(`Summarization Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error summarizing the content. No summary was found.`;
        }
    },
    _getLLMProvider: async function () {
        const preferences = await uiStore.getFromStorage('llmPreference', { provider: 'unknown', config: {} });
        if (preferences.provider === 'unknown') throw new Error('LLM provider is unknown');

        // Lazy load the getLLM function
        // @ts-ignore - This is a workaround to avoid circular dependency
        const { default: getLLM } = await import("@/utils/AiProviders");
        return getLLM(preferences.provider, preferences.config);
    },
    _summarizeChunk: async function (chunk: string, llmProvider: any): Promise<string> {
        const systemPrompt = `You are a helpful assistant that creates concise summaries. 
        Summarize the following text in 2-3 sentences, capturing the key points and main ideas. 
        Focus on the most important information and maintain accuracy.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Please summarize this text:\n\n${chunk}` }
        ];
        try {
            const response = await llmProvider.runBasicChatCompletion(messages as any);
            return response.textResponse;
        } catch (error) {
            console.error('Error summarizing chunk:', error);
            return `[Summary error for chunk: ${chunk.substring(0, 100)}...]`;
        }
    },
    _createHierarchicalSummary: async function (chunks: string[], llmProvider: any, streamEmitter: (event: IStreamEvent, data: any) => void): Promise<string> {
        streamEmitter('report_in_progress_thought', 'Summarizing document sections...');

        const chunkSummaries: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
            streamEmitter('report_in_progress_thought', `Processing section ${i + 1}/${chunks.length}...`);
            const summary = await this._summarizeChunk(chunks[i], llmProvider);
            chunkSummaries.push(summary);
        }

        if (chunkSummaries.length === 1) return chunkSummaries[0];
        streamEmitter('report_in_progress_thought', 'Combining summaries into final document summary...');

        const combinedSummaries = chunkSummaries.join('\n\n');
        const finalSystemPrompt = `You are a helpful assistant that creates comprehensive document summaries. 
        You have been given summaries of different sections of a document. 
        Create a cohesive, well-structured summary of the entire document that:
        1. Captures all the key points from all sections
        2. Maintains logical flow and coherence
        3. Is comprehensive yet concise (aim for 3-5 paragraphs)
        4. Preserves the most important information
        5. Uses clear, professional language`;

        const finalMessages = [
            { role: 'system', content: finalSystemPrompt },
            { role: 'user', content: `Please create a comprehensive summary of this document based on these section summaries:\n\n${combinedSummaries}` }
        ];
        try {
            const finalResponse = await llmProvider.runBasicChatCompletion(finalMessages as any);
            return finalResponse.textResponse;
        } catch (error) {
            console.error('Error creating final summary:', error);
            return `Document Summary:\n\n${combinedSummaries}`;
        }
    },
} as const;
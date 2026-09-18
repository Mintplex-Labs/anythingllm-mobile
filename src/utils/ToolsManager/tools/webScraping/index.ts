import { IAgentWebSearchCitation } from "@/database/models/WorkspaceChat";
import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { getOrigin, safeJsonParse } from "@/utils/formatters";
import webscraper from "./webscraper";
import { DownloadDeclinedError, getContentTypeFromURL, processLinkAsFile, resolveLinkAsFile } from "./linkAsFile";

export default {
    id: 'webScraping',
    name: 'Web Scraping',
    description: 'Scrape a single specific website for information.',
    defaultEnabled: true,
    category: 'default',
    definition: {
        type: 'function',
        function: {
            name: 'web_scraper',
            description: 'Scrape a single specific website for information. Returns the content of the websites page as text. If the URL points directly to a document (PDF, Word, Excel, PowerPoint) its text content is returned instead.',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'The URL of the website to scrape.',
                    },
                },
                required: ['url'],
            },
        },
    },
    config: {},
    execute: async function (args: { url: string } | string, streamEmitter: (event: IStreamEvent, data: any) => void): Promise<string> {
        try {
            const url = typeof args === 'string' ? safeJsonParse(args)?.url : args?.url;
            if (!url) return `No URL provided. No results were found.`;
            const hostname = getOrigin(url);

            // Ensure the URL is valid and always starts with https
            // Since we are using a webview we should do this.
            let validUrl = url;
            const protocolRegex = /^https?:\/\//i;
            if (!protocolRegex.test(validUrl)) validUrl = `https://${validUrl}`;
            else if (validUrl.match(/^http:\/\//i)) validUrl = validUrl.replace(/^http:\/\//i, 'https://');

            validUrl = new URL(validUrl);
            streamEmitter('report_status', `Reading ${validUrl.hostname}`);

            // If the link is really a document we can parse (by Content-Type only), download it,
            // extract the text and throw the file away. Everything else is a regular web page.
            const { contentType, contentLength } = await getContentTypeFromURL(validUrl.toString());
            const asFile = resolveLinkAsFile(validUrl.toString(), contentType);

            let title: string;
            let content: string;
            if (asFile && contentType) {
                streamEmitter('report_status', `Reading document ${asFile.fileName}`);
                const fileResult = await processLinkAsFile({ url: validUrl.toString(), contentType, contentLength });
                title = fileResult.fileName;
                content = fileResult.content;
            } else {
                const scrapeResult = await webscraper.scrape(validUrl.toString());
                title = scrapeResult.title ?? hostname;
                content = scrapeResult.content;
            }

            const citation = {
                type: 'web-search',
                reference: {
                    title,
                    url: validUrl.toString(),
                    content,
                },
            } as IAgentWebSearchCitation;

            streamEmitter('report_citations', [citation]);
            return content;
        } catch (e) {
            if (e instanceof DownloadDeclinedError) return `The user declined to download the document at this URL over cellular data. Do not retry.`;
            console.error(`Web Scraping Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error scraping the website. No content was found.`;
        }
    },
} as const;
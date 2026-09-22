import { IAgentWebSearchCitation } from "@/database/models/WorkspaceChat";
import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { getOrigin, safeJsonParse } from "@/utils/formatters";
import webscraper from "./webscraper";
import { DownloadDeclinedError, getContentTypeFromURL, processLinkAsFile, resolveLinkAsFile } from "./linkAsFile";

export type UrlDocument = {
    /** Page title, or the document's file name when the link points at a file */
    title: string;
    /** Page text (or extracted document text) */
    content: string;
    /** The URL that was actually read, normalised to https */
    url: string;
};

/**
 * Read a URL the way the web scraper tool does and return its text: a web page is scraped, while a
 * link that serves a document (PDF, Word, Excel, PowerPoint) is downloaded and parsed instead. Shared
 * by the tool and by URLs shared to the app (see utils/SharedContent).
 * @throws on an invalid URL, network failure, or when the user declines a cellular download.
 */
export async function readUrlAsDocument(url: string, onStatus?: (status: string) => void): Promise<UrlDocument> {
    const hostname = getOrigin(url);

    // Ensure the URL is valid and always starts with https
    // Since we are using a webview we should do this.
    let normalised = url.trim();
    const protocolRegex = /^https?:\/\//i;
    if (!protocolRegex.test(normalised)) normalised = `https://${normalised}`;
    else if (normalised.match(/^http:\/\//i)) normalised = normalised.replace(/^http:\/\//i, 'https://');

    const validUrl = new URL(normalised);
    onStatus?.(`Reading ${validUrl.hostname}`);

    // If the link is really a document we can parse (by Content-Type only), download it,
    // extract the text and throw the file away. Everything else is a regular web page.
    const { contentType, contentLength } = await getContentTypeFromURL(validUrl.toString());
    const asFile = resolveLinkAsFile(validUrl.toString(), contentType);

    if (asFile && contentType) {
        onStatus?.(`Reading document ${asFile.fileName}`);
        const fileResult = await processLinkAsFile({ url: validUrl.toString(), contentType, contentLength });
        return { title: fileResult.fileName, content: fileResult.content, url: validUrl.toString() };
    }

    const scrapeResult = await webscraper.scrape(validUrl.toString());
    return { title: scrapeResult.title ?? hostname, content: scrapeResult.content, url: validUrl.toString() };
}

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
            const { title, content, url: readUrl } = await readUrlAsDocument(url, (status) => streamEmitter('report_status', status));

            const citation = {
                type: 'web-search',
                reference: {
                    title,
                    url: readUrl,
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
import { IAgentWebSearchCitation } from "@/database/models/WorkspaceChat";
import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { getOrigin, safeJsonParse } from "@/utils/formatters";
import webscraper from "./webscraper";

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
            description: 'Scrape a single specific website for information. Returns the content of the websites page as text.',
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
            const scrapeResult = await webscraper.scrape(validUrl.toString());

            const citation = {
                type: 'web-search',
                reference: {
                    title: scrapeResult.title ?? hostname,
                    url: validUrl.toString(),
                    content: scrapeResult.content,
                },
            } as IAgentWebSearchCitation;

            streamEmitter('report_citations', [citation]);
            return scrapeResult.content;
        } catch (e) {
            console.error(`Web Scraping Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error scraping the website. No content was found.`;
        }
    },
} as const;
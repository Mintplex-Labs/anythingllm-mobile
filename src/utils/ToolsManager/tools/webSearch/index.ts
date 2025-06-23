import { IAgentWebSearchCitation } from "@/database/models/WorkspaceChat";
import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { safeJsonParse } from "@/utils/formatters";

export default {
    id: 'webSearch',
    name: 'Web Search',
    description: 'Search the web for search results based on a query.',
    defaultEnabled: true,
    category: 'default',
    definition: {
        type: 'function',
        function: {
            name: 'web_search',
            description: 'Search the web for search results based on a query.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The query to search the web for.',
                    },
                },
                required: ['query'],
            },
        },
    },
    config: {
        baseUrl: 'https://html.duckduckgo.com/html',
        maxResults: 3, // preserve context
    },
    execute: async function (args: { query: string } | string, streamEmitter: (event: IStreamEvent, data: any) => void): Promise<string> {
        try {
            const query = typeof args === 'string' ? safeJsonParse(args)?.query : args?.query;
            if (!query) return `No query provided. No results were found.`;

            const searchURL = new URL(this.config.baseUrl);
            searchURL.searchParams.append("q", query);

            console.log('searchURL', searchURL.toString());
            const response = await fetch(searchURL.toString())
                .then((res) => {
                    if (res.ok) return res.text();
                    throw new Error(`${res.status} - ${res.statusText}. params: ${JSON.stringify({ url: searchURL.toString() })}`);
                })
                .catch((e) => {
                    console.error(`DuckDuckGo Search Error: ${e.message}`);
                    return null;
                });

            if (!response) return `There was an error searching DuckDuckGo.`;
            const html = response;
            const data: { title: string, link: string, snippet: string }[] = [];
            const results = html.split('<div class="result results_links');

            // Skip first element since it's before the first result
            for (let i = 1; i <= Math.min(results.length - 1, this.config.maxResults); i++) {
                const result = results[i];

                // Extract title
                const titleMatch = result.match(
                    /<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/
                );
                const title = titleMatch ? titleMatch[1].trim() : "";

                // Extract URL
                const urlMatch = result.match(
                    /<a[^>]*class="result__a"[^>]*href="([^"]*)">/
                );
                const link = urlMatch ? urlMatch[1] : "";

                // Extract snippet
                const snippetMatch = result.match(
                    /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/
                );
                const snippet = snippetMatch
                    ? snippetMatch[1].replace(/<\/?b>/g, "").trim()
                    : "";

                if (title && link && snippet) {
                    data.push({
                        title,
                        link: this._convertLinkToReference(link),
                        snippet
                    });
                }
            }
            if (data.length === 0) return `No information was found online for the search query.`;
            console.log(`I found ${data.length} results - reviewing the results now`);

            // Report the citations to the UI
            const citations = this._extractWebSearchCitations(data);
            if (citations.length > 0) streamEmitter('report_citations', citations);
            return JSON.stringify(data);
        } catch (e) {
            console.error(`Web Search Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error searching the web. I found no results.`;
        }
    },

    /**
     * Converts the link to a reference instead of a giant DDG link with UTM parameters
     * @param link - The link to convert
     * @returns The reference
     */
    _convertLinkToReference(link: string): string {
        try {
            // Looking like //duckduckgo.com/l/?uddg=LINK_YOU_WANT&rut=1234567890
            let urlString = link;
            if (link.startsWith('//')) urlString = 'https:' + link;
            const url = new URL(urlString);
            const uddgParam = url.searchParams.get('uddg');
            if (!uddgParam) return link;
            return uddgParam;
        } catch (e) {
            return link;
        }
    },

    /**
     * Extracts the web search citations from the data
     * @param data - The data to extract the citations from
     * @returns The web search citations
     */
    _extractWebSearchCitations(data: { title: string, link: string, snippet: string }[]): IAgentWebSearchCitation[] {
        if (data.length === 0) return [];

        const webSearchCitations: IAgentWebSearchCitation[] = [];
        for (const result of data) {
            debugger
            webSearchCitations.push({
                type: 'web-search',
                reference: {
                    title: result.title,
                    url: result.link,
                    content: result.snippet,
                },
            });
        }
        return webSearchCitations;
    }
} as const;
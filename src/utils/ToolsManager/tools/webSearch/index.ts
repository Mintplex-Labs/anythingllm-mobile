import { IAgentWebSearchCitation } from "@/database/models/WorkspaceChat";
import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { safeJsonParse } from "@/utils/formatters";

type SearXNGResult = {
    url: string;
    title: string;
    content: string;
    publishedDate: string | null;
    thumbnail: string;
    engine: string;
    template: string;
    parsed_url: string[];
    img_src: string;
    priority: string;
    engines: string[];
    positions: number[];
    score: number;
    category: string;
}

type SERPResultItem = {
    title: string;
    link: string;
    snippet: string;
}

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
        maxResults: 4, // preserve context
        anythingLLMPublicSearXNGKey: '1hwFZHYnPHyK1cynbPq9oYbA0tCWpmPss9q8NYUTPyBXpUBPu833fi',
        anythingLLMPublicSerpHeader: 'x-anythingllm-searxng-serp',
    },
    execute: async function (args: { query: string } | string, streamEmitter: (event: IStreamEvent, data: any) => void): Promise<string> {
        try {
            const query = typeof args === 'string' ? safeJsonParse(args)?.query : args?.query;
            if (!query) return `No query provided. No results were found.`;

            let data = await this._searXNG(query);
            if (data.length === 0) return `No information was found online for the search query.`;
            console.log(`I found ${data.length} results - reviewing top ${this.config.maxResults} results now`);
            data = data.slice(0, this.config.maxResults);

            // Report the citations to the UI
            const citations = this._extractWebSearchCitations(data);
            if (citations.length > 0) streamEmitter('report_citations', citations);
            return JSON.stringify(data);
        } catch (e) {
            console.error(`Web Search Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error searching the web. I found no results.`;
        }
    },

    async _searXNG(query: string): Promise<SERPResultItem[]> {
        const baseUrl = 'https://cguicrchal1ftynn7buaizunxsjm0.anythingllm.com/search';
        const searchURL = new URL(baseUrl);
        searchURL.searchParams.append("q", query);
        searchURL.searchParams.append("format", "json");
        const results = await fetch(searchURL.toString(), {
            method: 'GET',
            headers: {
                [this.config.anythingLLMPublicSerpHeader]: this.config.anythingLLMPublicSearXNGKey,
                'x-device': 'mobile',
            },
        })
            .then((res) => {
                if (res.status === 200) return res.json();
                throw new Error(`${res.status} - ${res.statusText}. params: ${JSON.stringify({ url: searchURL.toString() })}`);
            })
            .then((data) =>
                data.results.map((result: SearXNGResult) => ({
                    title: result.title,
                    link: result.url,
                    snippet: result.content,
                }))
            )
            .catch((e) => {
                console.error(`SearXNG Search Error: ${e.message}`);
                return [];
            });
        return results;
    },

    // At some point DDG started blocking requests sent like this. It used to work and now its challenging to get results.
    // So we migrated to SearXNG via our own self-hosted instance.
    // async _duckDuckGoSearch(query: string): Promise<{ title: string, link: string, snippet: string }[]> {
    //     const baseUrl = 'https://html.duckduckgo.com/html';
    //     const searchURL = new URL(baseUrl);
    //     searchURL.searchParams.append("q", query);

    //     console.log('searchURL', searchURL.toString());
    //     const response = await fetch(searchURL.toString(), { method: 'GET' })
    //         .then((res) => {
    //             if (res.status === 200) return res.text();
    //             throw new Error(`${res.status} - ${res.statusText}. params: ${JSON.stringify({ url: searchURL.toString() })}`);
    //         })
    //         .catch((e) => {
    //             console.error(`DuckDuckGo Search Error: ${e.message}`);
    //             return null;
    //         });

    //     if (!response) throw new Error(`There was an error searching DuckDuckGo.`);

    //     const html = response;
    //     const data: { title: string, link: string, snippet: string }[] = [];
    //     const results = html.split('<div class="result results_links');

    //     // Skip first element since it's before the first result
    //     for (let i = 1; i <= Math.min(results.length - 1, this.config.maxResults); i++) {
    //         const result = results[i];

    //         // Extract title
    //         const titleMatch = result.match(
    //             /<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/
    //         );
    //         const title = titleMatch ? titleMatch[1].trim() : "";

    //         // Extract URL
    //         const urlMatch = result.match(
    //             /<a[^>]*class="result__a"[^>]*href="([^"]*)">/
    //         );
    //         const link = urlMatch ? urlMatch[1] : "";

    //         // Extract snippet
    //         const snippetMatch = result.match(
    //             /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/
    //         );
    //         const snippet = snippetMatch
    //             ? snippetMatch[1].replace(/<\/?b>/g, "").trim()
    //             : "";

    //         if (title && link && snippet) {
    //             data.push({
    //                 title,
    //                 link: this._convertLinkToReference(link),
    //                 snippet
    //             });
    //         }
    //     }
    //     return data;
    // },
    //
    // /**
    //  * Converts the link to a reference instead of a giant DDG link with UTM parameters
    //  * @param link - The link to convert
    //  * @returns The reference
    //  */
    // _convertLinkToReference(link: string): string {
    //     try {
    //         // Looking like //duckduckgo.com/l/?uddg=LINK_YOU_WANT&rut=1234567890
    //         let urlString = link;
    //         if (link.startsWith('//')) urlString = 'https:' + link;
    //         const url = new URL(urlString);
    //         const uddgParam = url.searchParams.get('uddg');
    //         if (!uddgParam) return link;
    //         return uddgParam;
    //     } catch (e) {
    //         return link;
    //     }
    // },

    /**
     * Extracts the web search citations from the data
     * @param data - The data to extract the citations from
     * @returns The web search citations
     */
    _extractWebSearchCitations(data: SERPResultItem[]): IAgentWebSearchCitation[] {
        if (data.length === 0) return [];

        const webSearchCitations: IAgentWebSearchCitation[] = [];
        for (const result of data) {
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
    },
} as const;
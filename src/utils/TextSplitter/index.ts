export type TextSplitterConfig = {
    chunkSize?: number;
    chunkOverlap?: number;
    chunkHeaderMeta?: object | null;
}

type DocumentMetadata = {
    id: string;
    url: string;
    title: string;
    docAuthor: string;
    description: string;
    docSource: string;
    chunkSource: string;
    published: string;
    wordCount: number;
    pageContent: string;
    token_count_estimate: number;
}

function isNullOrNaN(value) {
    if (value === null) return true;
    return isNaN(value);
}

export default class TextSplitter {
    #splitter: RecursiveSplitter | null;
    config: TextSplitterConfig;
    constructor(config: TextSplitterConfig = {
        chunkSize: 1024,
        chunkOverlap: 20,
        chunkHeaderMeta: null,
    }) {
        /*
          config can be a ton of things depending on what is required or optional by the specific splitter.
          Non-splitter related keys
          {
            splitByFilename: string, // TODO
          }
          ------
          Default: "RecursiveCharacterTextSplitter"
          Config: {
            chunkSize: number,
            chunkOverlap: number,
            chunkHeaderMeta: object | null, // Gets appended to top of each chunk as metadata
          }
          ------
        */
        this.config = config;
        this.#splitter = this.#setSplitter(config);
    }

    log(text: string, ...args: any[]) {
        console.log(`\x1b[35m[TextSplitter]\x1b[0m ${text}`, ...args);
    }

    /**
     *  Does a quick check to determine the text chunk length limit.
     * Embedder models have hard-set limits that cannot be exceeded, just like an LLM context
     * so here we want to allow override of the default 1000, but up to the models maximum, which is
     * sometimes user defined.
     */
    static determineMaxChunkSize(preferred = null, embedderLimit = 1000) {
        const prefValue = isNullOrNaN(preferred)
            ? Number(embedderLimit)
            : Number(preferred);
        const limit = Number(embedderLimit);
        if (prefValue > limit)
            console.log(
                `\x1b[43m[WARN]\x1b[0m Text splitter chunk length of ${prefValue} exceeds embedder model max of ${embedderLimit}. Will use ${embedderLimit}.`
            );
        return prefValue > limit ? limit : prefValue;
    }

    /**
     *  Creates a string of metadata to be prepended to each chunk.
     */
    static buildHeaderMeta(metadata = {}) {
        if (!metadata || Object.keys(metadata).length === 0) return null;
        const PLUCK_MAP = {
            title: {
                as: "sourceDocument",
                pluck: (metadata: DocumentMetadata) => {
                    return metadata?.title || null;
                },
            },
            published: {
                as: "published",
                pluck: (metadata: DocumentMetadata) => {
                    return metadata?.published || null;
                },
            },
            chunkSource: {
                as: "source",
                pluck: (metadata: DocumentMetadata) => {
                    const validPrefixes = ["link://", "youtube://"];
                    // If the chunkSource is a link or youtube link, we can add the URL
                    // as its source in the metadata so the LLM can use it for context.
                    // eg prompt: Where did you get this information? -> answer: "from https://example.com"
                    if (
                        !metadata?.chunkSource || // Exists
                        !metadata?.chunkSource.length || // Is not empty
                        typeof metadata.chunkSource !== "string" || // Is a string
                        !validPrefixes.some(
                            (prefix) => metadata.chunkSource.startsWith(prefix) // Has a valid prefix we respect
                        )
                    )
                        return null;

                    // We know a prefix is present, so we can split on it and return the rest.
                    // If nothing is found, return null and it will not be added to the metadata.
                    let source: string | null = null;
                    for (const prefix of validPrefixes) {
                        source = metadata.chunkSource.split(prefix)?.[1] || null;
                        if (source) break;
                    }

                    return source;
                },
            },
        };

        const pluckedData = {};
        Object.entries(PLUCK_MAP).forEach(([key, value]) => {
            if (!(key in metadata)) return; // Skip if the metadata key is not present.
            const pluckedValue = value.pluck(metadata as DocumentMetadata);
            if (!pluckedValue) return; // Skip if the plucked value is null/empty.
            pluckedData[value.as] = pluckedValue;
        });

        return pluckedData;
    }

    /**
     *  Creates a string of metadata to be prepended to each chunk.
     */
    stringifyHeader() {
        if (!this.config.chunkHeaderMeta) return null;
        let content = "";
        Object.entries(this.config.chunkHeaderMeta).map(([key, value]) => {
            if (!key || !value) return;
            content += `${key}: ${value}\n`;
        });

        if (!content) return null;
        return `<document_metadata>\n${content}</document_metadata>\n\n`;
    }

    #setSplitter(config: TextSplitterConfig = {
        chunkSize: 1024,
        chunkOverlap: 20,
        chunkHeaderMeta: null,
    }) {
        // if (!config?.splitByFilename) {// TODO do something when specific extension is present? }
        return new RecursiveSplitter({
            chunkSize: isNaN(config?.chunkSize ?? 1024) ? 1024 : Number(config?.chunkSize),
            chunkOverlap: isNaN(config?.chunkOverlap ?? 20) ? 20 : Number(config?.chunkOverlap),
            chunkHeader: this.stringifyHeader(),
        });
    }

    async splitText(documentText) {
        return this.#splitter?._splitText(documentText);
    }
}

// Wrapper for Langchain default RecursiveCharacterTextSplitter class.
class RecursiveSplitter {
    chunkHeader: string | null;
    engine: any;
    constructor({ chunkSize, chunkOverlap, chunkHeader = null }: { chunkSize: number, chunkOverlap: number, chunkHeader: string | null }) {
        const {
            RecursiveCharacterTextSplitter,
        } = require("@langchain/textsplitters");
        this.log(`Will split with`, { chunkSize, chunkOverlap });
        this.chunkHeader = chunkHeader;
        this.engine = new RecursiveCharacterTextSplitter({
            chunkSize,
            chunkOverlap,
        });
    }

    log(text: string, ...args: any[]) {
        console.log(`\x1b[35m[RecursiveSplitter]\x1b[0m ${text}`, ...args);
    }

    async _splitText(documentText) {
        if (!this.chunkHeader) return this.engine.splitText(documentText);
        const strings = await this.engine.splitText(documentText);
        const documents = await this.engine.createDocuments(strings, [], {
            chunkHeader: this.chunkHeader,
        });
        return documents
            .filter((doc: any) => !!doc.pageContent)
            .map((doc: any) => doc.pageContent);
    }
}

module.exports.TextSplitter = TextSplitter;
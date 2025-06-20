import { DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";

export interface ParsedContent {
    mainContent: string;
    reasoningContent: string;
    isThinking: boolean;
    isComplete: boolean;
}


const THOUGHT_KEYWORDS = ["thought", "thinking", "think", "thought_chain"];
const CLOSING_TAGS = [...THOUGHT_KEYWORDS, "response", "answer"];
export const THOUGHT_REGEX_OPEN = new RegExp(THOUGHT_KEYWORDS.map((keyword) => `<${keyword}\\s*(?:[^>]*?)?\\s*>`).join("|"));
export const THOUGHT_REGEX_CLOSE = new RegExp(CLOSING_TAGS.map((keyword) => `</${keyword}\\s*(?:[^>]*?)?>`).join("|"));
export const THOUGHT_REGEX_COMPLETE = new RegExp(
    THOUGHT_KEYWORDS.map(
        (keyword) =>
            `<${keyword}\\s*(?:[^>]*?)?\\s*>[\\s\\S]*?<\\/${keyword}\\s*(?:[^>]*?)?>`
    ).join("|")
);


/**
 * Extracts thought content from a string containing XML-like thought tags
 */
export function parseThoughtContent(content: string): ParsedContent {
    if (!content || typeof content !== 'string') {
        return {
            mainContent: content || '',
            reasoningContent: '',
            isThinking: false,
            isComplete: false
        };
    }

    let reasoningContent = '';
    let mainContent = content;
    let isThinking = false;
    let isComplete = false;

    // If the message is a perfect thought chain, we can render it directly
    // Complete == open and close tags match perfectly.
    if (content.match(THOUGHT_REGEX_COMPLETE)) {
        reasoningContent = content.match(THOUGHT_REGEX_COMPLETE)?.[0] || '';
        mainContent = content.replace(THOUGHT_REGEX_COMPLETE, "");
        isComplete = true;
    }

    // If the message is a thought chain but not a complete thought chain (matching opening tags but not closing tags),
    // we can render it as a thought chain if we can at least find a closing tag
    // This can occur when the assistant starts with <thinking> and then <response>'s later.
    if (
        content.match(THOUGHT_REGEX_OPEN) &&
        content.match(THOUGHT_REGEX_CLOSE)
    ) {
        const closingTag = content.match(THOUGHT_REGEX_CLOSE)?.[0];
        if (closingTag) {
            const splitMessage = content.split(closingTag);
            reasoningContent = splitMessage[0] + closingTag;
            mainContent = splitMessage[1] || '';
            isComplete = true;
        }
    }

    // If we have an open thought but no closing tag, it's still thinking
    if (content.match(THOUGHT_REGEX_OPEN) && !content.match(THOUGHT_REGEX_CLOSE)) {
        isThinking = true;
        const openMatch = content.match(THOUGHT_REGEX_OPEN);
        if (openMatch) {
            const openTag = openMatch[0];
            const afterOpenTag = content.substring(content.indexOf(openTag) + openTag.length);
            reasoningContent = openTag + afterOpenTag;
            mainContent = content.substring(0, content.indexOf(openTag));
        }
    }

    mainContent = mainContent.trim();
    reasoningContent = stripThoughtTags(reasoningContent);
    return {
        reasoningContent,
        mainContent,
        isThinking,
        isComplete
    };
}

/**
 * Checks if content has readable content (non-empty after removing thought tags)
 */
export function contentIsNotEmpty(content: string = ""): boolean {
    if (!content) return false;
    const cleaned = content
        .replace(THOUGHT_REGEX_OPEN, "")
        .replace(THOUGHT_REGEX_CLOSE, "")
        .replace(/[\n\s]/g, "");

    return cleaned.length > 0;
}

/**
 * Strips thought tags from a string
 */
export function stripThoughtTags(content: string): string {
    return content
        .replace(THOUGHT_REGEX_OPEN, "")
        .replace(THOUGHT_REGEX_CLOSE, "")
        .trim();
}

/**
 * Parses the streaming chunks to a response object
 * Enhanced to handle thought parsing for reasoning models
 */
export function parseStreamingChunksToResponse(
    event: IStreamEvent,
    accumulator: string,
    newChunk: string
): { textResponse: string, reasoningContent: string } | null {
    if (event === 'chunk') {
        const fullContent = accumulator + newChunk;
        const parsed = parseThoughtContent(fullContent);

        return {
            textResponse: parsed.mainContent,
            reasoningContent: parsed.reasoningContent,
        };
    }

    return null;
}
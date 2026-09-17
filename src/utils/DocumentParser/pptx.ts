import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/;

/**
 * fast-xml-parser `preserveOrder` output: each node is `{ [tagName]: childNodes[], ':@'?: attrs }`
 * and text is `{ '#text': string }`. Order is kept, which matters for reading runs in sequence.
 */
type OrderedNode = Record<string, any>;

const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: true,
    trimValues: false,
    parseTagValue: false,
});

function tagOf(node: OrderedNode): string | null {
    for (const key of Object.keys(node)) {
        if (key !== ':@' && key !== '#text') return key;
    }
    return null;
}

/** Collect the text of one `a:p` paragraph: `a:t` runs concatenated, `a:br` as a newline. */
function paragraphText(children: OrderedNode[]): string {
    let out = '';
    const walk = (nodes: OrderedNode[]) => {
        for (const node of nodes) {
            const tag = tagOf(node);
            if (!tag) continue;
            if (tag === 'a:t') {
                for (const child of node[tag] as OrderedNode[]) {
                    if (typeof child['#text'] === 'string') out += child['#text'];
                }
            } else if (tag === 'a:br') {
                out += '\n';
            } else if (Array.isArray(node[tag])) {
                walk(node[tag]);
            }
        }
    };
    walk(children);
    return out;
}

/** Depth-first search for `a:p` paragraphs, returning them in document order. */
function collectParagraphs(nodes: OrderedNode[], out: string[]) {
    for (const node of nodes) {
        const tag = tagOf(node);
        if (!tag) continue;
        if (tag === 'a:p') {
            const text = paragraphText(node[tag]);
            if (text.trim()) out.push(text.trimEnd());
        } else if (Array.isArray(node[tag])) {
            collectParagraphs(node[tag], out);
        }
    }
}

export function extractSlideXml(xml: string): string {
    const paragraphs: string[] = [];
    collectParagraphs(parser.parse(xml) as OrderedNode[], paragraphs);
    return paragraphs.join('\n');
}

/**
 * Extract the text of a .pptx. Slides are read in numeric order (slide1, slide2, ...) which is
 * the authoring order for the vast majority of decks. Speaker notes are not included.
 */
export function extractPptx(bytes: Uint8Array): string {
    const entries = unzipSync(bytes, { filter: file => SLIDE_PATH.test(file.name) });
    const slides = Object.keys(entries)
        .map(path => ({ path, index: Number(SLIDE_PATH.exec(path)![1]) }))
        .sort((a, b) => a.index - b.index);

    if (slides.length === 0) throw new Error('Presentation contains no slides');

    const sections: string[] = [];
    for (const { path, index } of slides) {
        const text = extractSlideXml(strFromU8(entries[path]));
        if (!text) continue;
        sections.push(`## Slide ${index}\n${text}`);
    }
    return sections.join('\n\n').trim();
}

import mammoth from 'mammoth';
import { Buffer } from 'buffer';

/**
 * Extract the text of a .docx using mammoth.
 *
 * Metro resolves mammoth's `browser` field, whose unzip accepts `{ arrayBuffer }`; Node (Jest)
 * resolves the default entry, whose unzip accepts `{ buffer }`. Passing both keeps one code path
 * working under either resolver. `Buffer` comes from the `buffer` package, which is also
 * installed as a global in `@/utils/polyfills` for mammoth's own internal use.
 */
export async function extractDocx(bytes: Uint8Array): Promise<string> {
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const input = { arrayBuffer, buffer: Buffer.from(bytes) } as unknown as Parameters<typeof mammoth.extractRawText>[0];
    const { value, messages } = await mammoth.extractRawText(input);
    for (const message of messages) {
        if (message.type === 'error') console.warn('[DocumentParser:docx]', message.message);
    }
    return value.replace(/\n{3,}/g, '\n\n').trim();
}

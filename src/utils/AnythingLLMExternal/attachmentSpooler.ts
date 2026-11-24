/**
 * AnythingLLM keeps a chat's image attachments inside its stored response JSON as base64 data URLs, and
 * `workspace-content` returns every chat of a workspace in one body, so a workspace of photo chats comes to
 * hundreds of MB - far more than the app can hold in memory at once. As the body streams in, each data URL is
 * cut out and handed to an `AttachmentSink` (which writes it to a file), and the value left in the body is
 * whatever the sink returns for it, such as that file's URI. The rest of the body passes through untouched.
 *
 * Each chat's `response` is a JSON string inside the body, so the field arrives escaped:
 * `\"contentString\":\"data:image/jpeg;base64,...\"`. A base64 data URL holds no quotes or backslashes, so the
 * value always ends at the next `\"`.
 */
const VALUE_START = '\\"contentString\\":\\"data:';
const VALUE_PREFIX = '\\"contentString\\":\\"';
const VALUE_END = '\\"';
/** Longest data URL header (`image/jpeg;base64`) accepted; anything longer is not an image attachment. */
const MAX_HEADER_LENGTH = 128;
/** Base64 held in memory before it is handed to the sink. */
const WRITE_BATCH_LENGTH = 512 * 1024;

export type AttachmentSink = {
    /**
     * Starts an attachment. `header` is its data URL header, e.g. `image/jpeg;base64`. Returns the text that
     * replaces the data URL in the body - it must not contain quotes or backslashes.
     */
    begin(header: string): string;
    /** Appends base64 data (always whole 4 character groups) to the attachment begun last. */
    write(base64: string): Promise<void>;
};

export type AttachmentSpooler = {
    /** Takes the next piece of body text and returns the text that is safe to keep. */
    push(chunk: string): Promise<string>;
    /** Returns the text held back waiting for more input. Call once the body has ended. */
    finish(): Promise<string>;
};

/**
 * @param sink - where attachment contents go. Without one they are dropped and their value left empty.
 */
export function createAttachmentSpooler(sink?: AttachmentSink): AttachmentSpooler {
    let state: 'text' | 'header' | 'data' | 'skip' = 'text';
    // Text held back because it may be the start of a marker that continues in the next chunk
    let pending = '';
    let header = '';
    let base64 = '';

    async function writeBase64(all: boolean) {
        const length = all ? base64.length : base64.length - (base64.length % 4);
        if (length === 0) return;
        const part = base64.slice(0, length);
        base64 = base64.slice(length);
        await sink!.write(part);
    }

    return {
        async push(chunk: string): Promise<string> {
            let text = pending + chunk;
            pending = '';
            let kept = '';

            while (text.length > 0) {
                if (state === 'text') {
                    const start = text.indexOf(VALUE_START);
                    if (start === -1) {
                        const safeLength = Math.max(0, text.length - (VALUE_START.length - 1));
                        kept += text.slice(0, safeLength);
                        pending = text.slice(safeLength);
                        return kept;
                    }
                    kept += text.slice(0, start) + VALUE_PREFIX;
                    text = text.slice(start + VALUE_START.length);
                    state = 'header';
                    header = '';
                    continue;
                }

                if (state === 'header') {
                    const comma = text.indexOf(',');
                    const end = text.indexOf(VALUE_END);
                    if (end !== -1 && (comma === -1 || end < comma)) {
                        // `data:` with no payload - leave the value empty
                        state = 'text';
                        text = text.slice(end);
                        continue;
                    }
                    if (comma === -1) {
                        header += text;
                        if (header.length > MAX_HEADER_LENGTH) state = 'skip';
                        else if (header.endsWith('\\')) { header = header.slice(0, -1); pending = '\\'; }
                        return kept;
                    }
                    header += text.slice(0, comma);
                    text = text.slice(comma + 1);
                    if (sink && header.length <= MAX_HEADER_LENGTH && header.endsWith(';base64')) {
                        kept += sink.begin(header);
                        state = 'data';
                    } else {
                        state = 'skip';
                    }
                    continue;
                }

                // 'data' or 'skip': the payload runs to the closing `\"`, which is kept to end the value
                const end = text.indexOf(VALUE_END);
                const payloadEnd = end === -1 ? (text.endsWith('\\') ? text.length - 1 : text.length) : end;
                if (state === 'data') base64 += text.slice(0, payloadEnd);
                if (end === -1) {
                    pending = text.slice(payloadEnd); // a trailing backslash may be the first half of `\"`
                    if (state === 'data' && base64.length >= WRITE_BATCH_LENGTH) await writeBase64(false);
                    return kept;
                }
                if (state === 'data') await writeBase64(true);
                state = 'text';
                text = text.slice(end);
            }
            return kept;
        },

        async finish(): Promise<string> {
            // A body that ends inside a data URL is cut short and will not parse - nothing more to keep.
            const rest = state === 'text' ? pending : '';
            pending = '';
            base64 = '';
            return rest;
        },
    };
}

import { createAttachmentSpooler, type AttachmentSink } from '../attachmentSpooler';

const CAT = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ+/';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const SVG = 'data:image/svg+xml;base64,PHN2Zz4=';

/** A `workspace-content` body: each chat's response is a JSON string, as the server stores it. */
function workspaceContentBody(images: { cat: string, png: string, svg: string }) {
    const response = (text: string, attachments: object[]) => JSON.stringify({ text, sources: [{ id: 'a', title: 'doc "1"', text: 'chunk \\ text' }], attachments });
    return JSON.stringify({
        threads: [{ id: 1, slug: 't' }],
        chats: [
            { id: 1, prompt: 'what is this?', response: response('a cat', [{ name: 'cat.jpg', mime: 'image/jpeg', contentString: images.cat }]) },
            { id: 2, prompt: 'no images', response: response('plain "quoted" answer', []) },
            {
                id: 3, prompt: 'two images', response: response('two', [
                    { name: 'a.png', mime: 'image/png', contentString: images.png },
                    { name: 'b.svg', mime: 'image/svg+xml', contentString: images.svg },
                ]),
            },
        ],
    });
}

function memorySink() {
    const files: { header: string, base64: string }[] = [];
    const sink: AttachmentSink = {
        begin(header) {
            files.push({ header, base64: '' });
            return `file:///spool/${files.length - 1}`;
        },
        async write(base64) {
            expect(base64.length % 4).toBe(0);
            files[files.length - 1].base64 += base64;
        },
    };
    return { sink, files };
}

async function spool(body: string, chunkSize: number, sink?: AttachmentSink) {
    const spooler = createAttachmentSpooler(sink);
    let out = '';
    for (let i = 0; i < body.length; i += chunkSize) out += await spooler.push(body.slice(i, i + chunkSize));
    return out + await spooler.finish();
}

describe('createAttachmentSpooler', () => {
    const body = workspaceContentBody({ cat: CAT, png: PNG, svg: SVG });

    it('hands every data URL to the sink and leaves its reference in the body, at every chunk size', async () => {
        const expected = JSON.parse(workspaceContentBody({ cat: 'file:///spool/0', png: 'file:///spool/1', svg: 'file:///spool/2' }));
        for (let size = 1; size <= body.length; size++) {
            const { sink, files } = memorySink();
            expect(JSON.parse(await spool(body, size, sink))).toEqual(expected);
            expect(files).toEqual([
                { header: 'image/jpeg;base64', base64: CAT.split(',')[1] },
                { header: 'image/png;base64', base64: PNG.split(',')[1] },
                { header: 'image/svg+xml;base64', base64: SVG.split(',')[1] },
            ]);
        }
    });

    it('empties data URLs when there is no sink', async () => {
        const expected = JSON.parse(workspaceContentBody({ cat: '', png: '', svg: '' }));
        for (const size of [1, 3, 64, body.length]) expect(JSON.parse(await spool(body, size))).toEqual(expected);
    });

    it('writes large attachments in batches', async () => {
        const big = `data:image/jpeg;base64,${'QUJD'.repeat(400_000)}`;
        const { sink, files } = memorySink();
        const write = jest.spyOn(sink, 'write');
        const out = await spool(workspaceContentBody({ cat: big, png: PNG, svg: SVG }), 8192, sink);
        expect(JSON.parse(out).chats).toHaveLength(3);
        expect(files[0].base64).toBe(big.split(',')[1]);
        expect(write.mock.calls.length).toBeGreaterThan(2);
    });

    it('passes a body without attachments through unchanged', async () => {
        const plain = JSON.stringify({ workspaces: [{ name: 'contentString: data:', slug: 'x' }] });
        for (const size of [1, 7, plain.length]) expect(await spool(plain, size, memorySink().sink)).toBe(plain);
    });
});

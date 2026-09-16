import { htmlToText, decodeHtmlEntities } from '../html';

describe('htmlToText', () => {
    it('drops scripts, styles and tags but keeps block structure', () => {
        const html = `<html><head><title>T</title><style>p{}</style></head><body>
            <h1>Title</h1><script>alert(1)</script>
            <p>First &amp; <b>bold</b> line.</p>
            <ul><li>one</li><li>two</li></ul>
            <table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
        </body></html>`;
        expect(htmlToText(html)).toBe('Title\nFirst & bold line.\none\ntwo\nA B\n1 2');
    });
    it('decodes numeric and named entities', () => {
        expect(decodeHtmlEntities('&#169; &#x41; &nbsp;x &unknown;')).toBe('© A  x &unknown;');
    });
});

import { zipSync, strToU8 } from 'fflate';
import * as XLSX from 'xlsx';
import { extractDocx } from '../docx';
import { extractPptx, extractSlideXml } from '../pptx';
import { extractSpreadsheet } from '../spreadsheet';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const DOCX_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCX_DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t xml:space="preserve">World</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Cell B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  </w:body>
</w:document>`;

const slideXml = (paragraphs: string[][]) => `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      ${paragraphs.map(runs => `<a:p>${runs.map(r => `<a:r><a:t>${r}</a:t></a:r>`).join('')}</a:p>`).join('')}
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

describe('extractDocx', () => {
    it('extracts paragraphs and table cells', async () => {
        const zip = zipSync({
            '[Content_Types].xml': strToU8(CONTENT_TYPES),
            '_rels/.rels': strToU8(DOCX_RELS),
            'word/document.xml': strToU8(DOCX_DOCUMENT),
        });
        const text = await extractDocx(zip);
        expect(text).toBe('Hello World\n\nSecond paragraph\n\nCell A\n\nCell B');
    });
});

describe('extractPptx', () => {
    it('orders slides numerically and joins runs', () => {
        const zip = zipSync({
            'ppt/slides/slide10.xml': strToU8(slideXml([['Tenth']])),
            'ppt/slides/slide2.xml': strToU8(slideXml([['Second ', 'slide'], ['Bullet']])),
            'ppt/slides/slide1.xml': strToU8(slideXml([['Title']])),
            'ppt/slides/_rels/slide1.xml.rels': strToU8('<x/>'),
            'ppt/notesSlides/notesSlide1.xml': strToU8(slideXml([['notes are skipped']])),
        });
        expect(extractPptx(zip)).toBe('## Slide 1\nTitle\n\n## Slide 2\nSecond slide\nBullet\n\n## Slide 10\nTenth');
    });
    it('treats a:br as a line break and skips empty paragraphs', () => {
        const xml = `<p:sld xmlns:a="a" xmlns:p="p"><p:txBody><a:p><a:r><a:t>Line 1</a:t></a:r><a:br/><a:r><a:t>Line 2</a:t></a:r></a:p><a:p><a:endParaRPr/></a:p></p:txBody></p:sld>`;
        expect(extractSlideXml(xml)).toBe('Line 1\nLine 2');
    });
    it('throws when there are no slides', () => {
        expect(() => extractPptx(zipSync({ 'docProps/app.xml': strToU8('<x/>') }))).toThrow(/no slides/);
    });
});

describe('extractSpreadsheet', () => {
    it('emits one CSV block per non-empty sheet', () => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name', 'Qty'], ['Widget', 3], ['Gadget, Deluxe', 1.5]]), 'Orders');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Empty');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Total', 4.5]]), 'Summary');
        const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
        expect(extractSpreadsheet(bytes)).toBe('## Orders\nName,Qty\nWidget,3\n"Gadget, Deluxe",1.5\n\n## Summary\nTotal,4.5');
    });
    it('reads legacy xls', () => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a', 'b']]), 'S');
        const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'biff8' }));
        expect(extractSpreadsheet(bytes)).toBe('## S\na,b');
    });
});

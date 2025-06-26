import { NativeModules } from 'react-native';
const { PdfParserModule } = NativeModules;

export interface PdfPageResult {
    pageNumber: number;
    text: string;
    error?: string;
}

export interface PdfParseResult {
    textContent: string;
    totalPages: number;
    filePath: string;
    fileName: string;
    fileSize: number;
}

interface PdfParserModuleInterface {
    extract(pdfPath: string): Promise<PdfParseResult>;
}

/**
 * PDFParser is a singleton class that provides a wrapper around the PdfParserModule native module.
 * It is used to extract text from PDF files on the device.
 *
 * @see android/app/src/main/java/com/anythingllm/pdfparser/PdfParserModule.kt
 */
class PDFParser {
    private static instance: PDFParser;
    // @ts-ignore-next-line
    private pdfParser: PdfParserModuleInterface;

    constructor() {
        if (PDFParser.instance) return PDFParser.instance;
        this.pdfParser = PdfParserModule;
        PDFParser.instance = this;
    }

    /**
     * Extract text from all pages of a PDF file.
     * @param pdfPath The local file path to the PDF (from device file picker).
     * @returns An object containing an array of page results and PDF metadata.
     */
    async extract(pdfPath: string): Promise<PdfParseResult | null> {
        try {
            return await this.pdfParser.extract(pdfPath);
        } catch (error) {
            console.error('Error extracting PDF text:', error);
            return null;
        }
    }
}

export default new PDFParser(); 
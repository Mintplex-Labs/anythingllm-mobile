import createTextFile from './text';
import createPdfFile from './pdf';
import createDocxFile from './docx';
import createPptxPresentation from './pptx';

/**
 * The "Create Files" skill group - one tool per output format so the user can enable exactly
 * the formats they want and the model only sees the ones that are on.
 */
export default {
    createTextFile,
    createPdfFile,
    createDocxFile,
    createPptxPresentation,
} as const;

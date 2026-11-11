#import "PdfParserModule.h"
#import <PDFKit/PDFKit.h>

// Extracts the text of every page of a PDF with PDFKit. Same result shape and error codes as
// android/app/src/main/java/com/anythingllm/pdfparser/PdfParserModule.kt.
@implementation PdfParserModule

RCT_EXPORT_MODULE(PdfParserModule);

RCT_EXPORT_METHOD(extract:(NSString *)pdfPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSURL *url = [pdfPath hasPrefix:@"file://"] ? [NSURL URLWithString:pdfPath] : [NSURL fileURLWithPath:pdfPath];
    NSString *path = url.path;
    NSFileManager *fileManager = NSFileManager.defaultManager;

    if (![fileManager fileExistsAtPath:path]) {
      reject(@"FILE_NOT_FOUND", [NSString stringWithFormat:@"PDF file not found at path: %@", path], nil);
      return;
    }
    if (![fileManager isReadableFileAtPath:path]) {
      reject(@"FILE_NOT_READABLE", [NSString stringWithFormat:@"Cannot read PDF file at path: %@", path], nil);
      return;
    }

    PDFDocument *document = [[PDFDocument alloc] initWithURL:url];
    if (!document) {
      reject(@"IO_ERROR", @"Error reading PDF file: not a valid PDF", nil);
      return;
    }
    // Encrypted PDFs that open with an empty password are readable; only a real password blocks us.
    if (document.isLocked && ![document unlockWithPassword:@""]) {
      reject(@"ENCRYPTED_PDF", @"PDF is encrypted and cannot be processed", nil);
      return;
    }

    NSMutableString *text = [NSMutableString string];
    NSInteger totalPages = document.pageCount;
    for (NSInteger index = 0; index < totalPages; index++) {
      @autoreleasepool {
        NSString *pageText = [document pageAtIndex:index].string ?: @"";
        [text appendString:[pageText stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet]];
        [text appendString:@"\n"];
      }
    }

    NSNumber *fileSize = [fileManager attributesOfItemAtPath:path error:nil][NSFileSize] ?: @0;
    resolve(@{
      @"textContent": text,
      @"totalPages": @(totalPages),
      @"filePath": path,
      @"fileName": path.lastPathComponent,
      @"fileSize": fileSize,
    });
  });
}

@end

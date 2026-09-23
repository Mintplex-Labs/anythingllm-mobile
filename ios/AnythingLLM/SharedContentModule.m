#import "SharedContentModule.h"
#import <React/RCTLog.h>
#import <UIKit/UIKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

static NSString *const kSharedContentEvent = @"SharedContentReceived";
static NSString *const kSharedDir = @"shared";

/** Items that arrived before JS subscribed (cold start) - drained by getInitialShare. */
static NSMutableArray<NSDictionary *> *pendingItems = nil;
/** The module instance JS is currently listening on, nil when nobody is subscribed. */
static SharedContentModule *activeInstance = nil;

@implementation SharedContentModule

RCT_EXPORT_MODULE(SharedContentModule);

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[kSharedContentEvent];
}

- (void)startObserving
{
  activeInstance = self;
}

- (void)stopObserving
{
  if (activeInstance == self) activeInstance = nil;
}

#pragma mark - Incoming files

+ (BOOL)handleOpenURL:(NSURL *)url options:(NSDictionary *)options
{
  if (![url isFileURL]) return NO;
  NSDictionary *item = [self copyToShared:url];
  if (!item) return NO;

  dispatch_async(dispatch_get_main_queue(), ^{
    if (activeInstance) {
      [activeInstance sendEventWithName:kSharedContentEvent body:@[item]];
    } else {
      if (!pendingItems) pendingItems = [NSMutableArray new];
      [pendingItems addObject:item];
    }
  });
  return YES;
}

/** Copy the incoming file into our tmp folder and describe it for JS. */
+ (NSDictionary *)copyToShared:(NSURL *)url
{
  BOOL scoped = [url startAccessingSecurityScopedResource];
  NSFileManager *fm = [NSFileManager defaultManager];
  NSString *dir = [NSTemporaryDirectory() stringByAppendingPathComponent:
                   [NSString stringWithFormat:@"%@/%@", kSharedDir, [[NSUUID UUID] UUIDString]]];
  NSError *error = nil;
  [fm createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:&error];

  NSString *name = url.lastPathComponent.length ? url.lastPathComponent : @"shared";
  NSURL *target = [NSURL fileURLWithPath:[dir stringByAppendingPathComponent:name]];
  BOOL copied = [fm copyItemAtURL:url toURL:target error:&error];
  if (scoped) [url stopAccessingSecurityScopedResource];
  if (!copied) {
    RCTLogWarn(@"[SharedContentModule] Could not copy shared file %@: %@", url, error);
    return nil;
  }

  // Files handed over by copy (not opened in place) land in Documents/Inbox and are ours to remove.
  if ([url.path containsString:@"/Inbox/"]) [fm removeItemAtURL:url error:nil];

  NSNumber *size = [fm attributesOfItemAtPath:target.path error:nil][NSFileSize] ?: @0;
  NSString *mime = [self mimeTypeForExtension:target.pathExtension];
  NSString *kind = [mime hasPrefix:@"image/"] ? @"image" : @"file";
  return @{
    @"kind": kind,
    @"uri": target.absoluteString,
    @"name": name,
    @"mimeType": mime,
    @"size": size,
  };
}

+ (NSString *)mimeTypeForExtension:(NSString *)extension
{
  if (extension.length) {
    UTType *type = [UTType typeWithFilenameExtension:extension];
    if (type.preferredMIMEType) return type.preferredMIMEType;
    if ([type conformsToType:UTTypeImage]) return @"image/*";
    if ([type conformsToType:UTTypeText]) return @"text/plain";
  }
  return @"application/octet-stream";
}

#pragma mark - JS API

/** The content the app was opened with, or null. Drains the queue so it is only returned once. */
RCT_EXPORT_METHOD(getInitialShare:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSArray *items = pendingItems.count ? [pendingItems copy] : nil;
    pendingItems = nil;
    resolve(items ?: [NSNull null]);
  });
}

/**
 * Downscale an image so its longest edge is at most `maxDimension` points, bake in the EXIF
 * orientation and return it as a base64 JPEG - the same shape the image picker gives us.
 */
RCT_EXPORT_METHOD(prepareImage:(NSString *)path
                  maxDimension:(double)maxDimension
                  quality:(double)quality
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSURL *url = [path hasPrefix:@"file:"] ? [NSURL URLWithString:path] : [NSURL fileURLWithPath:path];
    UIImage *image = url.path ? [UIImage imageWithContentsOfFile:url.path] : nil;
    if (!image) {
      reject(@"ERR_PREPARE_IMAGE", [NSString stringWithFormat:@"Could not decode image at %@", path], nil);
      return;
    }

    CGFloat longest = MAX(image.size.width, image.size.height);
    CGFloat scale = longest > maxDimension ? maxDimension / longest : 1.0;
    CGSize targetSize = CGSizeMake(MAX(1, floor(image.size.width * scale)), MAX(1, floor(image.size.height * scale)));

    UIGraphicsImageRendererFormat *format = [UIGraphicsImageRendererFormat defaultFormat];
    format.scale = 1.0;
    format.opaque = YES;
    UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:targetSize format:format];
    // drawInRect honours imageOrientation, so the output is upright without touching EXIF ourselves.
    UIImage *scaled = [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
      [image drawInRect:CGRectMake(0, 0, targetSize.width, targetSize.height)];
    }];

    NSData *jpeg = UIImageJPEGRepresentation(scaled, MIN(MAX(quality, 0.05), 1.0));
    if (!jpeg) {
      reject(@"ERR_PREPARE_IMAGE", @"Could not encode image", nil);
      return;
    }
    resolve(@{
      @"base64": [jpeg base64EncodedStringWithOptions:0],
      @"mime": @"image/jpeg",
      @"width": @(targetSize.width),
      @"height": @(targetSize.height),
    });
  });
}

@end

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

/**
 * Receives files other apps hand to AnythingLLM through the share sheet / "Open in" (the document
 * types declared in Info.plist) and passes them to JS as a list of items.
 *
 * AppDelegate forwards `application:openURL:options:` here. The file is copied into
 * `tmp/shared/<uuid>/<name>` immediately - the incoming URL may be security scoped and only readable
 * during that callback. JS removes the copy once it has parsed it (see utils/SharedContent).
 *
 *  - Cold start: the URL arrives before JS is listening, so it is queued and returned by `getInitialShare()`.
 *  - Already running: emitted as a `SharedContentReceived` event.
 */
@interface SharedContentModule : RCTEventEmitter <RCTBridgeModule>
+ (BOOL)handleOpenURL:(NSURL *)url options:(NSDictionary *)options;
@end

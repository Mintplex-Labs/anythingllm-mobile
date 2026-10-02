#import "LoopbackAuthModule.h"
#import <AuthenticationServices/AuthenticationServices.h>
#import <CommonCrypto/CommonDigest.h>
#import <UIKit/UIKit.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

/**
 * OAuth sign-in for providers that only accept an HTTP loopback redirect (`http://127.0.0.1:{port}/...`),
 * eg: Sign in with ChatGPT. For the length of one sign-in we listen on 127.0.0.1 with an OS-assigned port,
 * put that port into the authorize URL (`__LOOPBACK_PORT__`) and open it in an ASWebAuthenticationSession.
 * The session keeps the app in the foreground, so the listener keeps running; when the browser hits
 * `callbackPath` we resolve with the full callback URL and dismiss the sheet ourselves.
 * The OAuth logic itself (PKCE, state, token exchange) stays in JS - see src/utils/chatgpt/auth.ts.
 */

static NSString *const kPortPlaceholder = @"__LOOPBACK_PORT__";
static NSString *const kReturnURL = @"anythingllm://sign-in-complete";

@interface LoopbackAuthModule () <ASWebAuthenticationPresentationContextProviding>
@property (nonatomic, strong) ASWebAuthenticationSession *authSession;
@property (nonatomic, copy) RCTPromiseResolveBlock resolve;
@property (nonatomic, copy) RCTPromiseRejectBlock reject;
/** Bumped whenever a sign-in settles, so stale listeners, timeouts and session callbacks become no-ops. */
@property (atomic, assign) NSInteger sessionId;
@end

@implementation LoopbackAuthModule

RCT_EXPORT_MODULE(LoopbackAuthModule);

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_EXPORT_METHOD(sha256Base64Url:(NSString *)input
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSData *data = [input dataUsingEncoding:NSUTF8StringEncoding];
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
  NSString *base64 = [[NSData dataWithBytes:digest length:CC_SHA256_DIGEST_LENGTH] base64EncodedStringWithOptions:0];
  base64 = [base64 stringByReplacingOccurrencesOfString:@"+" withString:@"-"];
  base64 = [base64 stringByReplacingOccurrencesOfString:@"/" withString:@"_"];
  base64 = [base64 stringByReplacingOccurrencesOfString:@"=" withString:@""];
  resolve(base64);
}

RCT_EXPORT_METHOD(authorize:(NSString *)url
                  callbackPath:(NSString *)callbackPath
                  timeoutMs:(double)timeoutMs
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self finishWithURL:nil code:@"cancelled" message:@"Superseded by a new sign in."];

    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
      reject(@"listen_failed", @"Could not start the sign in listener.", nil);
      return;
    }
    int yes = 1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_len = sizeof(addr);
    addr.sin_family = AF_INET;
    addr.sin_port = htons(0);
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0 || listen(fd, 4) != 0) {
      close(fd);
      reject(@"listen_failed", @"Could not start the sign in listener.", nil);
      return;
    }
    socklen_t length = sizeof(addr);
    getsockname(fd, (struct sockaddr *)&addr, &length);
    int port = ntohs(addr.sin_port);

    NSInteger sid = self.sessionId;
    self.resolve = resolve;
    self.reject = reject;

    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      [self serveOn:fd port:port callbackPath:callbackPath sessionId:sid];
    });

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(timeoutMs * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{
      if (self.sessionId == sid) [self finishWithURL:nil code:@"timeout" message:@"Sign in timed out."];
    });

    NSString *authURL = [url stringByReplacingOccurrencesOfString:kPortPlaceholder
                                                       withString:[NSString stringWithFormat:@"%d", port]];
    __weak LoopbackAuthModule *weakSelf = self;
    ASWebAuthenticationSession *session =
      [[ASWebAuthenticationSession alloc] initWithURL:[NSURL URLWithString:authURL]
                                    callbackURLScheme:@"anythingllm"
                                    completionHandler:^(NSURL *callbackURL, NSError *error) {
        // The loopback listener settles a successful sign-in (and cancels this session first), so
        // reaching here with the flow still open means the user closed the sheet.
        dispatch_async(dispatch_get_main_queue(), ^{
          LoopbackAuthModule *strongSelf = weakSelf;
          if (strongSelf && strongSelf.sessionId == sid) {
            [strongSelf finishWithURL:nil code:@"cancelled" message:@"Sign in was cancelled."];
          }
        });
      }];
    session.presentationContextProvider = self;
    session.prefersEphemeralWebBrowserSession = NO;
    self.authSession = session;
    if (![session start]) {
      [self finishWithURL:nil code:@"no_browser" message:@"Could not open the sign in page."];
    }
  });
}

RCT_EXPORT_METHOD(cancel)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self finishWithURL:nil code:@"cancelled" message:@"Sign in was cancelled."];
  });
}

/** Must be called on the main queue. */
- (void)finishWithURL:(NSString *)callbackURL code:(NSString *)code message:(NSString *)message
{
  RCTPromiseResolveBlock resolve = self.resolve;
  RCTPromiseRejectBlock reject = self.reject;
  if (!resolve || !reject) return;
  self.resolve = nil;
  self.reject = nil;
  self.sessionId += 1;

  ASWebAuthenticationSession *session = self.authSession;
  self.authSession = nil;
  [session cancel];

  if (callbackURL) resolve(callbackURL);
  else reject(code, message, nil);
}

/**
 * Accepts connections until the callback arrives or the sign-in settles some other way. Polls rather than
 * blocking in accept() so the listener notices a cancel/timeout and closes its own socket.
 */
- (void)serveOn:(int)fd port:(int)port callbackPath:(NSString *)callbackPath sessionId:(NSInteger)sid
{
  while (self.sessionId == sid) {
    struct pollfd pfd = { .fd = fd, .events = POLLIN, .revents = 0 };
    int ready = poll(&pfd, 1, 250);
    if (ready <= 0) continue;

    int client = accept(fd, NULL, NULL);
    if (client < 0) continue;
    int on = 1;
    setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &on, sizeof(on));
    struct timeval timeout = { .tv_sec = 5, .tv_usec = 0 };
    setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));

    NSString *target = [self readRequestTarget:client];
    NSString *path = [[target componentsSeparatedByString:@"?"] firstObject];
    if (target && [path isEqualToString:callbackPath]) {
      NSURLComponents *components = [NSURLComponents componentsWithString:[@"http://127.0.0.1" stringByAppendingString:target]];
      BOOL failed = NO;
      for (NSURLQueryItem *item in components.queryItems) {
        if ([item.name isEqualToString:@"error"]) failed = YES;
      }
      [self writeResponse:client status:@"200 OK" contentType:@"text/html; charset=utf-8" body:[LoopbackAuthModule callbackPage:failed]];
      close(client);

      NSString *callbackURL = [NSString stringWithFormat:@"http://127.0.0.1:%d%@", port, target];
      dispatch_async(dispatch_get_main_queue(), ^{
        if (self.sessionId == sid) [self finishWithURL:callbackURL code:nil message:nil];
      });
      break;
    }

    [self writeResponse:client status:@"404 Not Found" contentType:@"text/plain; charset=utf-8" body:@"Not found"];
    close(client);
  }
  close(fd);
}

/** `GET /callback?code=... HTTP/1.1` -> `/callback?code=...` */
- (NSString *)readRequestTarget:(int)client
{
  NSMutableData *buffer = [NSMutableData data];
  char chunk[2048];
  while (buffer.length < 16384) {
    ssize_t read = recv(client, chunk, sizeof(chunk), 0);
    if (read <= 0) break;
    [buffer appendBytes:chunk length:(NSUInteger)read];
    if ([buffer rangeOfData:[@"\r\n\r\n" dataUsingEncoding:NSASCIIStringEncoding] options:0 range:NSMakeRange(0, buffer.length)].location != NSNotFound) break;
  }
  NSString *request = [[NSString alloc] initWithData:buffer encoding:NSASCIIStringEncoding];
  NSString *requestLine = [[request componentsSeparatedByString:@"\r\n"] firstObject];
  NSArray<NSString *> *parts = [requestLine componentsSeparatedByString:@" "];
  if (parts.count < 2 || ![parts[0] isEqualToString:@"GET"]) return nil;
  return parts[1];
}

- (void)writeResponse:(int)client status:(NSString *)status contentType:(NSString *)contentType body:(NSString *)body
{
  NSData *bodyData = [body dataUsingEncoding:NSUTF8StringEncoding];
  NSString *head = [NSString stringWithFormat:@"HTTP/1.1 %@\r\nContent-Type: %@\r\nContent-Length: %lu\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
                    status, contentType, (unsigned long)bodyData.length];
  NSMutableData *response = [[head dataUsingEncoding:NSASCIIStringEncoding] mutableCopy];
  [response appendData:bodyData];
  send(client, response.bytes, response.length, 0);
}

+ (NSString *)callbackPage:(BOOL)failed
{
  NSString *title = failed ? @"Sign in was not completed" : @"You're signed in";
  NSString *detail = failed ? @"You can close this page and try again in AnythingLLM." : @"You can return to AnythingLLM.";
  return [NSString stringWithFormat:
    @"<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
    @"<title>AnythingLLM</title><style>"
    @"body{font-family:-apple-system,system-ui,sans-serif;background:#0e0f0f;color:#fff;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center}"
    @"main{padding:24px}p{color:#9f9fa0}"
    @"a{display:inline-block;margin-top:16px;padding:12px 20px;border-radius:8px;background:#fff;color:#0e0f0f;font-weight:600;text-decoration:none}"
    @"</style></head><body><main><h2>%@</h2><p>%@</p><a href=\"%@\">Return to AnythingLLM</a></main></body></html>",
    title, detail, kReturnURL];
}

- (ASPresentationAnchor)presentationAnchorForWebAuthenticationSession:(ASWebAuthenticationSession *)session
{
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:[UIWindowScene class]]) continue;
    for (UIWindow *window in ((UIWindowScene *)scene).windows) {
      if (window.isKeyWindow) return window;
    }
  }
  return UIApplication.sharedApplication.windows.firstObject;
}

@end

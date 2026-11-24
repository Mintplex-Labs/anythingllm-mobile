#import "WebScraperModule.h"
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

static const NSTimeInterval kTimeoutSeconds = 30;
/** Quiet time after the last finished navigation before the DOM is read, so client-rendered pages settle */
static const NSTimeInterval kSettleDelaySeconds = 0.8;

static NSString *const kExtractScript =
  @"JSON.stringify({ title: document.title || '', content: document.body ? document.body.innerText : '', url: window.location.href })";

// Images, media and fonts are never needed for innerText, so they are blocked to load pages faster.
static NSString *const kBlockAssetsRules =
  @"[{\"trigger\":{\"url-filter\":\".*\",\"resource-type\":[\"image\",\"media\",\"font\"]},\"action\":{\"type\":\"block\"}}]";

/**
 * One scrape: loads a URL in a hidden, non-persistent WKWebView attached off-screen to the key window
 * (detached web views get their JavaScript throttled) and resolves with the page's title, text and
 * final URL. Everything runs on the main queue; `settled` makes sure the promise settles exactly once.
 */
@interface WebScrape : NSObject <WKNavigationDelegate>
@property (nonatomic, copy) NSString *url;
@property (nonatomic, copy) RCTPromiseResolveBlock resolve;
@property (nonatomic, copy) RCTPromiseRejectBlock reject;
@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, assign) BOOL settled;
@property (nonatomic, assign) NSUInteger generation;
- (void)startWithURL:(NSURL *)url rules:(WKContentRuleList *)rules;
@end

static NSMutableSet<WebScrape *> *activeScrapes;
static WKContentRuleList *blockAssetsRuleList;

@implementation WebScraperModule

RCT_EXPORT_MODULE(WebScraperModule);

RCT_EXPORT_METHOD(scrape:(NSString *)url
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSURL *target = [NSURL URLWithString:url];
    if (!target) {
      reject(@"SCRAPE_ERROR", @"Invalid URL", nil);
      return;
    }
    if (!activeScrapes) activeScrapes = [NSMutableSet set];

    WebScrape *scrape = [WebScrape new];
    scrape.url = url;
    scrape.resolve = resolve;
    scrape.reject = reject;
    [activeScrapes addObject:scrape];

    [WebScraperModule withBlockAssetsRules:^(WKContentRuleList *rules) {
      [scrape startWithURL:target rules:rules];
    }];
  });
}

/** Compiles the asset-blocking rules once. Scrapes still run, just slower, if compiling fails. */
+ (void)withBlockAssetsRules:(void (^)(WKContentRuleList *))completion
{
  if (blockAssetsRuleList) {
    completion(blockAssetsRuleList);
    return;
  }
  [WKContentRuleListStore.defaultStore
    compileContentRuleListForIdentifier:@"anythingllm-scraper-block-assets"
                 encodedContentRuleList:kBlockAssetsRules
                      completionHandler:^(WKContentRuleList *list, NSError *error) {
    dispatch_async(dispatch_get_main_queue(), ^{
      blockAssetsRuleList = list;
      completion(list);
    });
  }];
}

@end

@implementation WebScrape

- (void)startWithURL:(NSURL *)url rules:(WKContentRuleList *)rules
{
  WKWebViewConfiguration *config = [WKWebViewConfiguration new];
  config.websiteDataStore = WKWebsiteDataStore.nonPersistentDataStore;
  if (rules) [config.userContentController addContentRuleList:rules];

  self.webView = [[WKWebView alloc] initWithFrame:CGRectMake(-10000, -10000, 1024, 768) configuration:config];
  self.webView.navigationDelegate = self;
  self.webView.hidden = YES;
  [[WebScrape keyWindow] addSubview:self.webView];

  __weak WebScrape *weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kTimeoutSeconds * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    [weakSelf rejectWithCode:@"TIMEOUT_ERROR"
                     message:[NSString stringWithFormat:@"Scraping timed out after %d seconds", (int)kTimeoutSeconds]];
  });

  [self.webView loadRequest:[NSURLRequest requestWithURL:url]];
}

// Fires again for redirects and client-side routing, so each one restarts the settle timer.
- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation
{
  if (self.settled) return;
  NSUInteger generation = ++self.generation;
  __weak WebScrape *weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kSettleDelaySeconds * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    WebScrape *scrape = weakSelf;
    if (scrape && scrape.generation == generation) [scrape extract];
  });
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error
{
  [self failWithError:error];
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error
{
  [self failWithError:error];
}

- (void)failWithError:(NSError *)error
{
  // A new navigation (eg. a client-side redirect) cancels the previous one - not a real failure.
  if ([error.domain isEqualToString:NSURLErrorDomain] && error.code == NSURLErrorCancelled) return;
  [self rejectWithCode:@"SCRAPE_ERROR" message:[NSString stringWithFormat:@"WebView error: %@", error.localizedDescription]];
}

- (void)extract
{
  if (self.settled) return;
  [self.webView evaluateJavaScript:kExtractScript completionHandler:^(id value, NSError *error) {
    if (self.settled) return;
    if (error || ![value isKindOfClass:NSString.class]) {
      [self rejectWithCode:@"SCRAPE_ERROR" message:[NSString stringWithFormat:@"Could not read page: %@", error.localizedDescription]];
      return;
    }
    NSDictionary *page = [NSJSONSerialization JSONObjectWithData:[value dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
    NSString *finalUrl = [page[@"url"] length] > 0 ? page[@"url"] : self.url;
    RCTPromiseResolveBlock resolve = self.resolve;
    [self finish];
    resolve(@{ @"title": page[@"title"] ?: @"", @"content": page[@"content"] ?: @"", @"url": finalUrl });
  }];
}

- (void)rejectWithCode:(NSString *)code message:(NSString *)message
{
  if (self.settled) return;
  RCTPromiseRejectBlock reject = self.reject;
  [self finish];
  reject(code, message, nil);
}

- (void)finish
{
  self.settled = YES;
  [self.webView stopLoading];
  self.webView.navigationDelegate = nil;
  [self.webView removeFromSuperview];
  self.webView = nil;
  [activeScrapes removeObject:self];
}

+ (UIWindow *)keyWindow
{
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class]) continue;
    for (UIWindow *window in ((UIWindowScene *)scene).windows) {
      if (window.isKeyWindow) return window;
    }
  }
  return nil;
}

@end

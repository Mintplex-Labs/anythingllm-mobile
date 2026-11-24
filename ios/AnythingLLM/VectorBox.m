#import "VectorBox.h"
#import <Accelerate/Accelerate.h>
#import <sqlite3.h>

/**
 * Workspace vector store with the same JS interface as the Android ObjectBox module
 * (android/app/src/main/java/com/anythingllm/vectordb/VectorBox.kt).
 *
 * Vectors live in SQLite as float32 blobs. Search is an exact cosine scan of the workspace's vectors
 * with Accelerate, which stays fast at on-device sizes (thousands of chunks) and needs no index.
 * Scores are cosine distance (1 - similarity, lower is closer), matching ObjectBox.
 * All database access goes through one serial queue.
 */
@implementation VectorBox

static sqlite3 *db;
static dispatch_queue_t queue;

RCT_EXPORT_MODULE(VectorBox);

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (dispatch_queue_t)methodQueue
{
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    queue = dispatch_queue_create("com.anythingllm.vectorbox", DISPATCH_QUEUE_SERIAL);
  });
  return queue;
}

/** Opens the database on first use. Lives in Application Support: not visible in Files, not user content. */
- (BOOL)open:(RCTPromiseRejectBlock)reject
{
  if (db) return YES;
  NSURL *dir = [[NSFileManager.defaultManager URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject
                URLByAppendingPathComponent:@"vectorbox" isDirectory:YES];
  [NSFileManager.defaultManager createDirectoryAtURL:dir withIntermediateDirectories:YES attributes:nil error:nil];
  NSString *path = [dir URLByAppendingPathComponent:@"vectors.sqlite"].path;

  if (sqlite3_open(path.UTF8String, &db) != SQLITE_OK) {
    reject(@"ERROR", [NSString stringWithFormat:@"Could not open vector database: %s", sqlite3_errmsg(db)], nil);
    sqlite3_close(db);
    db = NULL;
    return NO;
  }
  const char *schema =
    "PRAGMA journal_mode=WAL;"
    "CREATE TABLE IF NOT EXISTS vectors ("
    "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
    "  workspace_slug TEXT NOT NULL,"
    "  embedding BLOB NOT NULL,"
    "  metadata TEXT"
    ");"
    "CREATE INDEX IF NOT EXISTS vectors_workspace_slug ON vectors (workspace_slug);";
  return [self exec:schema reject:reject];
}

- (BOOL)exec:(const char *)sql reject:(RCTPromiseRejectBlock)reject
{
  char *error = NULL;
  if (sqlite3_exec(db, sql, NULL, NULL, &error) == SQLITE_OK) return YES;
  reject(@"ERROR", [NSString stringWithFormat:@"%s", error], nil);
  sqlite3_free(error);
  return NO;
}

- (void)rejectWithDbError:(RCTPromiseRejectBlock)reject
{
  reject(@"ERROR", [NSString stringWithFormat:@"%s", sqlite3_errmsg(db)], nil);
}

/** Runs a single-statement query whose only result is one integer, eg. a COUNT(*). */
- (void)countWithSql:(const char *)sql slug:(NSString *)slug resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  if (![self open:reject]) return;
  sqlite3_stmt *stmt;
  if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) != SQLITE_OK) return [self rejectWithDbError:reject];
  if (slug) sqlite3_bind_text(stmt, 1, slug.UTF8String, -1, SQLITE_TRANSIENT);
  double count = sqlite3_step(stmt) == SQLITE_ROW ? sqlite3_column_int64(stmt, 0) : 0;
  sqlite3_finalize(stmt);
  resolve(@(count));
}

static NSData *floatData(NSArray<NSNumber *> *values)
{
  NSMutableData *data = [NSMutableData dataWithLength:values.count * sizeof(float)];
  float *floats = data.mutableBytes;
  for (NSUInteger i = 0; i < values.count; i++) floats[i] = values[i].floatValue;
  return data;
}

/** Inserts one row with a prepared insert statement. Returns the new id, or -1 on failure. */
static sqlite3_int64 insertRow(sqlite3_stmt *stmt, NSString *slug, NSArray<NSNumber *> *embedding, NSString *metadata)
{
  NSData *blob = floatData(embedding);
  sqlite3_reset(stmt);
  sqlite3_bind_text(stmt, 1, slug.UTF8String, -1, SQLITE_TRANSIENT);
  sqlite3_bind_blob(stmt, 2, blob.bytes, (int)blob.length, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 3, (metadata ?: @"{}").UTF8String, -1, SQLITE_TRANSIENT);
  if (sqlite3_step(stmt) != SQLITE_DONE) return -1;
  return sqlite3_last_insert_rowid(db);
}

static const char *kInsertSql = "INSERT INTO vectors (workspace_slug, embedding, metadata) VALUES (?, ?, ?)";

RCT_EXPORT_METHOD(getCount:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  [self countWithSql:"SELECT COUNT(*) FROM vectors" slug:nil resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(workspaceVectorCount:(NSString *)workspaceSlug
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self countWithSql:"SELECT COUNT(*) FROM vectors WHERE workspace_slug = ?" slug:workspaceSlug resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(insert:(NSString *)workspaceSlug
                  embedding:(NSArray<NSNumber *> *)embedding
                  metadata:(NSString *)metadata
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (![self open:reject]) return;
  if (embedding.count == 0) return reject(@"ERROR", @"Embedding array is empty", nil);
  sqlite3_stmt *stmt;
  if (sqlite3_prepare_v2(db, kInsertSql, -1, &stmt, NULL) != SQLITE_OK) return [self rejectWithDbError:reject];
  sqlite3_int64 rowId = insertRow(stmt, workspaceSlug, embedding, metadata);
  sqlite3_finalize(stmt);
  if (rowId < 0) return [self rejectWithDbError:reject];
  resolve(@((double)rowId));
}

RCT_EXPORT_METHOD(bulkInsert:(NSString *)workspaceSlug
                  vectors:(NSArray<NSDictionary *> *)vectors
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (![self open:reject]) return;
  for (NSUInteger i = 0; i < vectors.count; i++) {
    NSArray *embedding = vectors[i][@"embedding"];
    if (![embedding isKindOfClass:NSArray.class] || embedding.count == 0) {
      return reject(@"ERROR", [NSString stringWithFormat:@"Embedding at index %lu is missing or empty", (unsigned long)i], nil);
    }
  }

  if (![self exec:"BEGIN" reject:reject]) return;
  sqlite3_stmt *stmt;
  if (sqlite3_prepare_v2(db, kInsertSql, -1, &stmt, NULL) != SQLITE_OK) {
    [self rejectWithDbError:reject];
    sqlite3_exec(db, "ROLLBACK", NULL, NULL, NULL);
    return;
  }

  NSMutableArray<NSNumber *> *ids = [NSMutableArray arrayWithCapacity:vectors.count];
  for (NSDictionary *vector in vectors) {
    id metadata = vector[@"metadata"];
    sqlite3_int64 rowId = insertRow(stmt, workspaceSlug, vector[@"embedding"], [metadata isKindOfClass:NSString.class] ? metadata : nil);
    if (rowId < 0) {
      [self rejectWithDbError:reject];
      sqlite3_finalize(stmt);
      sqlite3_exec(db, "ROLLBACK", NULL, NULL, NULL);
      return;
    }
    [ids addObject:@((double)rowId)];
  }
  sqlite3_finalize(stmt);
  if (![self exec:"COMMIT" reject:reject]) return;
  resolve(ids);
}

RCT_EXPORT_METHOD(resetVectorsForWorkspace:(NSString *)workspaceSlug
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (![self open:reject]) return;
  sqlite3_stmt *stmt;
  if (sqlite3_prepare_v2(db, "DELETE FROM vectors WHERE workspace_slug = ?", -1, &stmt, NULL) != SQLITE_OK) return [self rejectWithDbError:reject];
  sqlite3_bind_text(stmt, 1, workspaceSlug.UTF8String, -1, SQLITE_TRANSIENT);
  int result = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (result != SQLITE_DONE) return [self rejectWithDbError:reject];
  resolve(@YES);
}

RCT_EXPORT_METHOD(semanticSearch:(NSString *)workspaceSlug
                  queryVector:(NSArray<NSNumber *> *)queryVector
                  topN:(double)topN
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (![self open:reject]) return;
  NSUInteger limit = MAX(0, (NSInteger)topN);
  NSData *queryData = floatData(queryVector);
  const float *query = queryData.bytes;
  vDSP_Length dimensions = queryVector.count;
  float queryNorm = 0;
  vDSP_svesq(query, 1, &queryNorm, dimensions);
  queryNorm = sqrtf(queryNorm);
  if (limit == 0 || dimensions == 0 || queryNorm == 0) return resolve(@[]);

  sqlite3_stmt *stmt;
  if (sqlite3_prepare_v2(db, "SELECT id, embedding FROM vectors WHERE workspace_slug = ?", -1, &stmt, NULL) != SQLITE_OK) {
    return [self rejectWithDbError:reject];
  }
  sqlite3_bind_text(stmt, 1, workspaceSlug.UTF8String, -1, SQLITE_TRANSIENT);

  NSMutableArray<NSArray *> *scored = [NSMutableArray array];
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    // Vectors from a different embedder (another dimension) can't be compared, so they are skipped.
    if ((vDSP_Length)sqlite3_column_bytes(stmt, 1) != dimensions * sizeof(float)) continue;
    const float *vector = sqlite3_column_blob(stmt, 1);
    float dot = 0, norm = 0;
    vDSP_dotpr(query, 1, vector, 1, &dot, dimensions);
    vDSP_svesq(vector, 1, &norm, dimensions);
    if (norm == 0) continue;
    double distance = 1.0 - dot / (queryNorm * sqrtf(norm));
    [scored addObject:@[@(distance), @(sqlite3_column_int64(stmt, 0))]];
  }
  sqlite3_finalize(stmt);

  [scored sortUsingComparator:^NSComparisonResult(NSArray *a, NSArray *b) { return [a[0] compare:b[0]]; }];
  NSArray<NSArray *> *top = [scored subarrayWithRange:NSMakeRange(0, MIN(limit, scored.count))];
  if (top.count == 0) return resolve(@[]);

  NSMutableDictionary<NSNumber *, NSString *> *metadataById = [NSMutableDictionary dictionary];
  // "?,?,?" - one placeholder per result
  NSString *placeholders = [@"" stringByPaddingToLength:top.count * 2 - 1 withString:@"?," startingAtIndex:0];
  NSString *sql = [NSString stringWithFormat:@"SELECT id, metadata FROM vectors WHERE id IN (%@)", placeholders];
  if (sqlite3_prepare_v2(db, sql.UTF8String, -1, &stmt, NULL) != SQLITE_OK) return [self rejectWithDbError:reject];
  for (NSUInteger i = 0; i < top.count; i++) sqlite3_bind_int64(stmt, (int)i + 1, [top[i][1] longLongValue]);
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    const unsigned char *metadata = sqlite3_column_text(stmt, 1);
    metadataById[@(sqlite3_column_int64(stmt, 0))] = metadata ? [NSString stringWithUTF8String:(const char *)metadata] : @"{}";
  }
  sqlite3_finalize(stmt);

  NSMutableArray<NSDictionary *> *results = [NSMutableArray arrayWithCapacity:top.count];
  for (NSArray *entry in top) {
    [results addObject:@{
      @"id": @([entry[1] doubleValue]),
      @"metadata": metadataById[entry[1]] ?: @"{}",
      @"score": entry[0],
    }];
  }
  resolve(results);
}

RCT_EXPORT_METHOD(reset:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  if (![self open:reject]) return;
  if (![self exec:"DELETE FROM vectors" reject:reject]) return;
  resolve(@YES);
}

RCT_EXPORT_METHOD(deleteVectorsByIds:(NSArray<NSNumber *> *)ids
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (![self open:reject]) return;
  if (![self exec:"BEGIN" reject:reject]) return;
  sqlite3_stmt *stmt;
  if (sqlite3_prepare_v2(db, "DELETE FROM vectors WHERE id = ?", -1, &stmt, NULL) != SQLITE_OK) {
    [self rejectWithDbError:reject];
    sqlite3_exec(db, "ROLLBACK", NULL, NULL, NULL);
    return;
  }
  for (NSNumber *vectorId in ids) {
    sqlite3_reset(stmt);
    sqlite3_bind_int64(stmt, 1, vectorId.longLongValue);
    sqlite3_step(stmt);
  }
  sqlite3_finalize(stmt);
  if (![self exec:"COMMIT" reject:reject]) return;
  resolve(@YES);
}

@end

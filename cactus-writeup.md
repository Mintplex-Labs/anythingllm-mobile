## Cactus Compute debugging.

### Method one: Using `{initLlama, LlamaContext } from 'cactus-react-native'`

In this method, we use the `initLlama` function to initialize the model.

```ts
// This works with llama.rn using the same code.
const lm = await initLlama({
        model: this.ggufFilePath,
        use_mlock: true,
        n_ctx: this.contextLength,
        n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
        embedding: false,
      })

this.cactusLmContext = lm
```

Then we invoke the `completion` method on the `LlamaContext` instance as we normally would.

```ts
// In the Inference class method
const msgResult = await this.cactusLmContext.completion({
      messages: messages,
      stop: stops,
      n_predict: this.nPredict,
      jinja: this.cactusLmContext.isJinjaSupported(),
      tools: availableTools,
      tool_choice: 'auto',
      ...this.defaultRuntimeConfig as any,
      temperature: this.temperature,
    }, (data: { token: string }) => {
      const { token } = data;
      callback(token);
    });
```

With `messages`:
```
[
  {
    "role": "system",
    "content": "You are a helpful assistant that can answer questions and help with tasks."
  },
  {
    "role": "user",
    "content": "Hello"
  }
]
```
✅ This works and returns a valid response.

If you send another message with any content - it will return an error of 
```
Error processing chat TypeError: Cannot assign to read-only property 'length'
    at push (native)
    at apply (native)
    at ?anon_0_ (http://localhost:8081/index.bundle//&platform=android&dev=true&lazy=true&minify=false&app=com.anythingllm&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server:375955:68)
    at next (native)
    at asyncGeneratorStep (
      ....
```

Offending line in `cactus-react-native`: https://github.com/cactus-compute/cactus/blob/526e9cbadec2298d325d605ca482784cdcb3a30a/react/src/index.ts#L330

Changing `stops` to `[...stops]` fixes the issue - not sure why.

### Messages returning nothing at all

Sending up to three simple prompts eventually returns nothing at all.
Logcat
```txt
   D  BRIDGE: completion() method called with contextId=48265
2025-08-19 21:35:11.236  6460-8106  Cactus                  com.anythingllm                      D  BRIDGE: AsyncTask queued for execution
2025-08-19 21:35:11.236  6460-8181  Cactus                  com.anythingllm                      D  ⚡ BRIDGE: AsyncTask doInBackground starting...
2025-08-19 21:35:11.236  6460-8181  Cactus                  com.anythingllm                      D  BRIDGE: Context found, checking if predicting...
2025-08-19 21:35:11.236  6460-8181  Cactus                  com.anythingllm                      D  BRIDGE: About to call context.completion()...
2025-08-19 21:35:11.236  6460-8181  CactusContext           com.anythingllm                      D  🔵 ANDROID: completion() called
2025-08-19 21:35:11.237  6460-8181  CactusContext           com.anythingllm                      D  📝 ANDROID: prompt length = 2568
2025-08-19 21:35:11.237  6460-8181  CactusContext           com.anythingllm                      D  🧮 ANDROID: context ptr = -5476376675703627600
2025-08-19 21:35:11.237  6460-8181  CactusContext           com.anythingllm                      D  🚀 ANDROID: About to call doCompletion native method...
2025-08-19 21:35:11.237  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  [Cactus] Not preserved because more than 1 token (wrong chat template override?): <function
2025-08-19 21:35:11.237  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  [Cactus] Not preserved because more than 1 token (wrong chat template override?): <tools>
2025-08-19 21:35:11.237  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  [Cactus] Not preserved because more than 1 token (wrong chat template override?): </tools>
2025-08-19 21:35:11.237  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  [Cactus] Not preserved because more than 1 token (wrong chat template override?): <response>
2025-08-19 21:35:11.237  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  [Cactus] Not preserved because more than 1 token (wrong chat template override?): </response>
2025-08-19 21:35:11.237  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  [Cactus] Not preserved because more than 1 token (wrong chat template override?): <function_call>
2025-08-19 21:35:11.237  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  [Cactus] Not preserved because more than 1 token (wrong chat template override?): </function_call>
2025-08-19 21:35:11.237  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  [Cactus] Not preserved because more than 1 token (wrong chat template override?): <json>
2025-08-19 21:35:11.237  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  [Cactus] Not preserved because more than 1 token (wrong chat template override?): </json>
2025-08-19 21:35:11.237  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  [Cactus] Not preserved because more than 1 token (wrong chat template override?): <JSON>
2025-08-19 21:35:11.237  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  [Cactus] Not preserved because more than 1 token (wrong chat template override?): </JSON>
2025-08-19 21:35:11.238  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  [Cactus] Not preserved because more than 1 token (wrong chat template override?): ```json
2025-08-19 21:35:11.238  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  [Cactus] Not preserved because more than 1 token (wrong chat template override?): ```xml
2025-08-19 21:35:11.243  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  llama_perf_context_print:        load time =     229.76 ms
2025-08-19 21:35:11.243  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  llama_perf_context_print: prompt eval time =       0.00 ms /     1 tokens (    0.00 ms per token,      inf tokens per second)
2025-08-19 21:35:11.243  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  llama_perf_context_print:        eval time =       0.00 ms /     1 runs   (    0.00 ms per token,      inf tokens per second)
2025-08-19 21:35:11.243  6460-8181  CACTUS_ANDROID_JNI      com.anythingllm                      I  llama_perf_context_print:       total time =       4.10 ms /     2 tokens
2025-08-19 21:35:11.244  6460-8181  CactusContext           com.anythingllm                      D  ✅ ANDROID: doCompletion returned successfully
2025-08-19 21:35:11.244  6460-8181  CactusContext           com.anythingllm                      D  📤 ANDROID: completion() returning result
2025-08-19 21:35:11.244  6460-8181  Cactus                  com.anythingllm                      D  BRIDGE: context.completion() returned successfully
2025-08-19 21:35:11.248  6460-6460  Cactus                  com.anythingllm                      D  BRIDGE: onPostExecute called
2025-08-19 21:35:11.248  6460-6460  Cactus                  com.anythingllm                      D  BRIDGE: Resolving promise with result
2025-08-19 21:35:11.248  6460-6460  Cactus                  com.anythingllm                      D  BRIDGE: completion() finished successfully
```

Just to be sure, we set n_predict to -1 and it still returns nothing. Thought it could be the that, but its only three messages. Sometimes we can get a response, but it might only be some of the thought, not the real full response. Logcat shows no errors.

--------


## Next, try to use the `CactusLM` class directly

```ts
import { CactusLM } from 'cactus-react-native';

 const { lm, error } = await CactusLM.init({
        model: this.ggufFilePath,
        use_mlock: true,
        n_ctx: this.contextLength,
        n_threads: 4,
        n_gpu_layers: 99,
        embedding: false,
      });

      if (error) throw error;
      this.cactusLmContext = lm;
```

Chats no longer fail or return nothing, but passing in `tools` you can debug the output of the _formatted_ messages in Cactus are ignored:

```ts
// Example pre-written tools

const availableTools = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the weather for the users current location",
      parameters: {
        type: "object",
        properties: {
        },
        required: []
      }
    }
  }
]

const msgResult = await this.cactusLmContext.completion(
      messages,
      {
        stop: stops,
        n_predict: this.nPredict,
        tools: availableTools,
        tool_choice: 'auto',
        ...this.defaultRuntimeConfig as any,
        temperature: this.temperature,
      }, ({ token }: { token: string }) => {
        callback(token);
      });
```
```ts
// src: https://github.com/cactus-compute/cactus/blob/526e9cbadec2298d325d605ca482784cdcb3a30a/react/src/index.ts#L305
const formattedResult = await this.getFormattedChat(
        params.messages,
        params.chat_template || params.chatTemplate,
        {
          jinja: params.jinja,
          tools: params.tools,
          parallel_tool_calls: params.parallel_tool_calls,
          tool_choice: params.tool_choice,
        },
      )
// Debugging this shows a filled chat template that omits all tools calls.
```

If you enable `jinja: true` - the `formattedResult` is a valid tool-calling chat template string.

We also cannot check if `isJinjaSupported()` is true or false from the `CactusLM` class - so i cannot use that to determine if we should use jinja or not.

However, even with `jinja: true` - we get a valid tool call, but for a single tool call.
```
[
  {role: 'system', content: 'You are a helpful assistant that can answer questions and help with tasks.'}
  {role: 'user', content: 'Get the current time'}
]

We get a tool call, so we run it and get a result and then on 

```
// For simplicity, we only have one tool call at a time AND we join the tool call result to the user message, just so it is as close to a normal chat response as possible.
[
{role: 'system', content: 'You are a helpful assistant that can answer questions and help with tasks.'}
{role: 'user', content: 'Get the current time\nFunction: get_current_time()\nResult: 10:19:43 PM'}
]
```

We always get this error:
```
Error processing chat TypeError: Cannot assign to read-only property 'length'
    at push (native)
    at apply (native)
    at ?anon_0_ (http://localhost:8081/index.bundle//&platform=android&dev=true&lazy=true&minify=false&app=com.anythingllm&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server:375956:68)
    at next (native)
    at asyncGeneratorStep (
      ....
```

This is the same as the above `stops` issue - so changing `stops` to `[...stops]` and rerunning same prompts and now it works!


--------------------

Other questions
num_gpu_layers: 99 // is this still only IOS supported (ref: llama.rn)
n_threads: 4 // How can we determine this value?

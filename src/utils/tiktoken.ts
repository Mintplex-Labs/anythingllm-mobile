import 'text-encoding-polyfill';
import { getEncodingNameForModel, getEncoding, TiktokenEncoding, Tiktoken, TiktokenModel } from "js-tiktoken";

/**
 * @class TokenManager
 *
 * @notice
 * We cannot do estimation of tokens here like we do in the collector
 * because we need to know the model to do it.
 * Other issues are we also do reverse tokenization here for the chat history during cannonballing.
 * So here we are stuck doing the actual tokenization and encoding until we figure out what to do with prompt overflows.
 */
export default class TokenManager {
  static instance: TokenManager | null = null;
  static currentModel: string | null = null;

  private model: string = '';
  private encoderName: TiktokenEncoding = 'cl100k_base';

  // @ts-ignore
  private encoder: Tiktoken;

  constructor(model = "gpt-3.5-turbo") {
    if (TokenManager.instance && TokenManager.currentModel === model) {
      this.log("Returning existing instance for model:", model);
      return TokenManager.instance;
    }

    this.model = model;
    this.encoderName = this.#getEncodingFromModel(model);
    this.encoder = getEncoding(this.encoderName);

    TokenManager.instance = this;
    TokenManager.currentModel = model;
    return this;
  }

  log(text: string, ...args: any[]) {
    console.log(`\x1b[35m[TokenManager]\x1b[0m ${text}`, ...args);
  }

  #getEncodingFromModel(model: string | TiktokenModel) {
    try {
      // @ts-ignore
      return getEncodingNameForModel(model);
    } catch {
      return "cl100k_base";
    }
  }

  /**
   * Pass in an empty array of disallowedSpecials to handle all tokens as text and to be tokenized.
   */
  tokensFromString(input = "") {
    try {
      const tokens = this.encoder.encode(String(input), undefined, []);
      return tokens;
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  /**
   * Converts an array of tokens back to a string.
   */
  bytesFromTokens(tokens = []) {
    const bytes = this.encoder.decode(tokens);
    return bytes;
  }

  /**
   * Counts the number of tokens in a string.
   */
  countFromString(input: string = "") {
    const tokens = this.tokensFromString(input);
    return tokens.length;
  }

  /**
   * Estimates the number of tokens in a string or array of strings.
   */
  statsFrom(input: string | string[]) {
    if (typeof input === "string") return this.countFromString(input);

    // What is going on here?
    // https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb Item 6.
    // The only option is to estimate. From repeated testing using the static values in the code we are always 2 off,
    // which means as of Nov 1, 2023 the additional factor on ln: 476 changed from 3 to 5.
    if (Array.isArray(input)) {
      const perMessageFactorTokens = input.length * 3;
      const tokensFromContent = input.reduce(
        // @ts-ignore
        (a, b) => a + this.countFromString(b.content),
        0
      );
      const diffCoefficient = 5;
      return perMessageFactorTokens + tokensFromContent + diffCoefficient;
    }

    throw new Error("Not a supported tokenized format.");
  }
}
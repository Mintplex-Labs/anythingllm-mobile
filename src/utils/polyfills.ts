import { polyfillGlobal } from 'react-native/Libraries/Utilities/PolyfillFunctions';
import 'react-native-url-polyfill/auto';
import structuredClone from '@ungap/structured-clone';
import { TextEncoderStream, TextDecoderStream } from '@stardazed/streams-text-encoding';
import { ReadableStream } from 'web-streams-polyfill'
import { polyfill as polyfillBase64 } from 'react-native-polyfill-globals/src/base64';
import { polyfill as polyfillEncoding } from 'react-native-polyfill-globals/src/encoding';
import { polyfill as polyfillURL } from 'react-native-polyfill-globals/src/url';
import { polyfill as polyfillFetch } from 'react-native-polyfill-globals/src/fetch';
import { polyfill as polyfillCrypto } from 'react-native-polyfill-globals/src/crypto';

(async () => {
  let polyfilled: string[] = [];

  if (!('structuredClone' in global)) {
    polyfillGlobal('structuredClone', () => structuredClone);
    polyfilled.push('structuredClone');
  }

  if (!('TextEncoderStream' in global)) {
    polyfillGlobal('TextEncoderStream', () => TextEncoderStream);
    polyfilled.push('TextEncoderStream');
  }

  if (!('TextDecoderStream' in global)) {
    polyfillGlobal('TextDecoderStream', () => TextDecoderStream);
    polyfilled.push('TextDecoderStream');
  }

  if (!('ReadableStream' in global)) {
    polyfillGlobal('ReadableStream', () => ReadableStream);
    polyfilled.push('ReadableStream');
  }

  polyfillBase64();
  polyfilled.push('base64');

  polyfillEncoding();
  polyfilled.push('encoding');

  polyfillURL();
  polyfilled.push('url');

  polyfillFetch();
  polyfilled.push('fetch');

  polyfillCrypto();
  polyfilled.push('crypto');

  console.log(`polyfilled: `, polyfilled);
})();
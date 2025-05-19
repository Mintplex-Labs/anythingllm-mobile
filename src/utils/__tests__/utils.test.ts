import {
  deepMerge,
  extractHFModelTitle,
  extractHFModelType,
  formatBytes,
  getTextSizeInBytes,
  safeParseJSON,
  unwrap,
} from '..';

describe('formatBytes', () => {
  it('formats bytes correctly when the size is 0', () => {
    expect.assertions(1);
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats kiB correctly', () => {
    expect.assertions(1);
    expect(formatBytes(1024, 2, true)).toBe('1 KiB');
  });

  it('formats GiB correctly', () => {
    expect.assertions(1);
    expect(formatBytes(1024 * 1024 * 1024, 2, true)).toBe('1 GiB');
  });

  it('formats MB correctly', () => {
    expect.assertions(1);
    expect(formatBytes(1234567, 2, false)).toBe('1.23 MB');
  });

  it('formats GB correctly', () => {
    expect.assertions(1);
    expect(formatBytes(12345678901, 2, false)).toBe('12.35 GB');
  });

  it('formats correctly with three digits with 2 decimals', () => {
    expect.assertions(1);
    expect(formatBytes(1234567890, 2, false, true)).toBe('1.23 GB');
  });

  it('formats correctly with three digits with 1 decimals', () => {
    expect.assertions(1);
    expect(formatBytes(12345678901, 2, false, true)).toBe('12.3 GB');
  });

  it('formats correctly with three digits with 0 decimals', () => {
    expect.assertions(1);
    expect(formatBytes(123456789000, 2, false, true)).toBe('123 GB');
  });
});

describe('getTextSizeInBytes', () => {
  it('calculates the size for a simple text', () => {
    expect.assertions(1);
    const text = 'text';
    expect(getTextSizeInBytes(text)).toBe(4);
  });

  it('calculates the size for an emoji text', () => {
    expect.assertions(1);
    const text = '🤔 🤓';
    expect(getTextSizeInBytes(text)).toBe(9);
  });
});

describe('unwrap', () => {
  it('returns an empty object', () => {
    expect.assertions(1);
    expect(unwrap(undefined)).toStrictEqual({});
  });

  it('returns a provided prop', () => {
    expect.assertions(1);
    const prop = 'prop';
    expect(unwrap(prop)).toStrictEqual(prop);
  });
});

describe('deepMerge', () => {
  it('should merge two flat objects', () => {
    const target = {a: 1, b: 2};
    const source = {b: 3, c: 4};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: 1, b: 2, c: 4}); // b should remain 2
  });

  it('should merge nested objects', () => {
    const target = {a: {b: 1}};
    const source = {a: {c: 2}};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: {b: 1, c: 2}}); // c should be added
  });

  it('should overwrite nested properties', () => {
    const target = {a: {b: 1, c: 2}};
    const source = {a: {b: 3}};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: {b: 1, c: 2}}); // b should remain 1
  });

  it('should handle arrays correctly', () => {
    const target = {a: [1, 2]};
    const source = {a: [3, 4]};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: [1, 2]});
  });

  it('should handle null values', () => {
    const target = {a: null};
    const source = {a: {b: 1}};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: {b: 1}}); // Replaces null with the object
  });

  it('should handle flat to nested', () => {
    const target = {a: 1, c: {d: 2, e: 3}};
    const source = {a: {b: 1}, c: 4};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: {b: 1}, c: 4});
  });

  it('should not modify the original objects', () => {
    const target = {a: 1};
    const source = {b: 2};
    deepMerge(target, source);
    expect(target).toEqual({a: 1, b: 2});
    expect(source).toEqual({b: 2}); // Source should remain unchanged
  });

  it('should handle empty objects', () => {
    const target = {};
    const source = {a: 1};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: 1}); // Merges from source
  });

  it('should handle deeply nested objects', () => {
    const target = {a: {b: {c: 1}}};
    const source = {a: {b: {d: 2}}};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: {b: {c: 1, d: 2}}});
  });

  it('should merge multiple levels of nesting', () => {
    const target = {a: {b: {c: {d: 1, e: 3}}}};
    const source = {a: {b: {c: {e: 2, f: 4}}}};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: {b: {c: {d: 1, e: 3, f: 4}}}});
  });
});

describe('extractHFModelType', () => {
  test('extracts model type correctly', () => {
    expect(
      extractHFModelType('bartowski/Llama-3.1-Nemotron-70B-Instruct-HF-GGUF'),
    ).toBe('Llama');
    expect(extractHFModelType('author/Giraffe-2.0-Model-Guide-Example')).toBe(
      'Giraffe',
    );
    expect(extractHFModelType('foo/Bar-1.0-Test')).toBe('Bar');
    expect(extractHFModelType('invalidInputWithoutSlashOrHyphen')).toBe(
      'Unknown',
    );
    expect(extractHFModelType('slashOnly/')).toBe('Unknown');
    expect(extractHFModelType('owner/modelWithoutSuffix')).toBe(
      'modelWithoutSuffix',
    );
  });
});

describe('extractHFModelTitle', () => {
  test('extracts model title correctly', () => {
    expect(
      extractHFModelTitle('bartowski/Llama-3.1-Nemotron-70B-Instruct-HF-GGUF'),
    ).toBe('Llama-3.1-Nemotron-70B-Instruct-HF');
    expect(
      extractHFModelTitle('bartowski/Llama-3.1-Nemotron-70B-Instruct-HF_gguf'),
    ).toBe('Llama-3.1-Nemotron-70B-Instruct-HF');
    expect(
      extractHFModelTitle('bartowski/Llama-3.1-Nemotron-70B-Instruct-HFGGUF'),
    ).toBe('Llama-3.1-Nemotron-70B-Instruct-HF');
    expect(extractHFModelTitle('author/Giraffe-2.0-Model-Guide-Example')).toBe(
      'Giraffe-2.0-Model-Guide-Example',
    );
    expect(extractHFModelTitle('foo/Bar-1.0-Test')).toBe('Bar-1.0-Test');
    expect(extractHFModelTitle('withoutSlashOrHyphen')).toBe(
      'withoutSlashOrHyphen',
    );
    expect(extractHFModelTitle('slashOnly/')).toBe('Unknown');
    expect(extractHFModelTitle('owner/modelWithoutSuffix')).toBe(
      'modelWithoutSuffix',
    );
  });
});

describe('safeParseJSON', () => {
  // Case 1: Normal valid JSON
  test('parses valid JSON correctly', () => {
    const validJson = '{"prompt": "Hello world"}';
    expect(safeParseJSON(validJson)).toEqual({prompt: 'Hello world'});
  });

  // Case 2: JSON with trailing text
  test('parses JSON with trailing text', () => {
    const jsonWithTrailing = '{"prompt": "Hello world"} Some extra text here';
    expect(safeParseJSON(jsonWithTrailing)).toEqual({prompt: 'Hello world'});
  });

  // Case 3: Incomplete JSON missing closing brace
  test('handles incomplete JSON with missing closing brace', () => {
    const incompleteJson = '{"prompt": "Hello world';
    expect(safeParseJSON(incompleteJson)).toEqual({prompt: 'Hello world'});
  });

  // Additional edge cases
  test('handles different quote styles and spacing around prompt key', () => {
    const variations = [
      '{"prompt" : "Hello"}',
      '{"prompt"  :  "Hello"}',
      '{"prompt"\n:\n"Hello"}',
    ];

    variations.forEach(json => {
      expect(safeParseJSON(json)).toHaveProperty('prompt', 'Hello');
    });
  });

  test('returns null for invalid JSON', () => {
    const invalidCases = ['', 'not json at all', '{notEvenJson}'];

    invalidCases.forEach(invalid => {
      expect(safeParseJSON(invalid)).toEqual({
        prompt: '',
        error: expect.any(Error),
      });
    });
  });
});

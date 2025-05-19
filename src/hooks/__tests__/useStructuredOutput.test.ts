import {renderHook, act} from '@testing-library/react-hooks';
import {useStructuredOutput} from '../useStructuredOutput';
import {modelStore} from '../../store';

// Mock the modelStore
jest.mock('../../store', () => ({
  modelStore: {
    context: {
      completion: jest.fn(),
    },
  },
}));

describe('useStructuredOutput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset modelStore.context for each test
    (modelStore as any).context = {
      completion: jest.fn(),
    };
  });

  it('should generate structured output successfully', async () => {
    const mockResponse = {text: '{"key": "value"}'};
    (modelStore.context!.completion as jest.Mock).mockResolvedValueOnce(
      mockResponse,
    );

    const {result} = renderHook(() => useStructuredOutput());

    const prompt = 'test prompt';
    const schema = {type: 'object', properties: {key: {type: 'string'}}};

    let output;
    await act(async () => {
      output = await result.current.generate(prompt, schema);
    });

    expect(output).toEqual({key: 'value'});
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(modelStore.context?.completion).toHaveBeenCalledWith({
      messages: [{role: 'user', content: prompt}],
      response_format: {
        type: 'json_schema',
        json_schema: {
          strict: true,
          schema,
        },
      },
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
      n_predict: 2000,
    });
  });

  it('should handle custom options', async () => {
    const mockResponse = {text: '{"key": "value"}'};
    (modelStore.context!.completion as jest.Mock).mockResolvedValueOnce(
      mockResponse,
    );

    const {result} = renderHook(() => useStructuredOutput());

    const options = {
      temperature: 0.5,
      top_p: 0.8,
      top_k: 30,
      repeat_penalty: 1.1,
    };

    await act(async () => {
      await result.current.generate('test', {}, options);
    });

    expect(modelStore.context?.completion).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: options.temperature,
        top_p: options.top_p,
        top_k: options.top_k,
      }),
    );
  });

  it('should handle invalid JSON response', async () => {
    const mockResponse = {text: 'invalid json'};
    (modelStore.context!.completion as jest.Mock).mockResolvedValueOnce(
      mockResponse,
    );

    const {result} = renderHook(() => useStructuredOutput());

    let output;
    await act(async () => {
      output = await result.current.generate('test', {});
    });

    expect(output).toEqual({prompt: '', error: expect.any(Error)});
    expect(result.current.isGenerating).toBe(false);
  });

  it('should handle uninitialized model context', async () => {
    // Mock modelStore with undefined context
    (modelStore as any).context = undefined;

    const {result} = renderHook(() => useStructuredOutput());

    let error;
    await act(async () => {
      try {
        await result.current.generate('test', {});
      } catch (e) {
        error = e;
      }
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Model context not initialized');
    expect(result.current.isGenerating).toBe(false);
  });

  it('should handle completion error', async () => {
    const errorMessage = 'Completion failed';
    (modelStore.context!.completion as jest.Mock).mockRejectedValueOnce(
      new Error(errorMessage),
    );

    const {result} = renderHook(() => useStructuredOutput());

    let error;
    await act(async () => {
      try {
        await result.current.generate('test', {});
      } catch (e) {
        error = e;
      }
    });

    expect(error).toBeDefined();
    expect(error.message).toBe(errorMessage);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBe(errorMessage);
  });
});

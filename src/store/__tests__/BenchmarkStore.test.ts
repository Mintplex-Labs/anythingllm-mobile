import {BenchmarkStore} from '../BenchmarkStore';
import {BenchmarkResult} from '../../utils/types';

describe('BenchmarkStore', () => {
  let store: BenchmarkStore;
  const mockResult: BenchmarkResult = {
    config: {
      pp: 1,
      tg: 1,
      pl: 512,
      nr: 3,
      label: 'Test Config',
    },
    modelDesc: 'Test Model',
    modelSize: 1000000,
    modelNParams: 7000000000,
    ppAvg: 20.5,
    ppStd: 1.2,
    tgAvg: 30.5,
    tgStd: 2.1,
    timestamp: '2024-03-20T10:00:00.000Z',
    modelId: 'test-model-id',
    modelName: 'Test Model',
    filename: 'test-model.gguf',
    uuid: 'test-uuid',
  };

  beforeEach(() => {
    store = new BenchmarkStore();
  });

  it('adds new result to the beginning of results array', () => {
    store.addResult(mockResult);
    expect(store.results[0]).toEqual(mockResult);
  });

  it('removes result by timestamp', () => {
    store.addResult(mockResult);
    store.removeResult(mockResult.timestamp);
    expect(store.results.length).toBe(0);
  });

  it('clears all results', () => {
    store.addResult(mockResult);
    store.addResult({...mockResult, uuid: 'test-uuid-2'});
    store.clearResults();
    expect(store.results.length).toBe(0);
  });

  it('gets results by model ID', () => {
    const differentModelResult = {
      ...mockResult,
      modelId: 'different-model',
      uuid: 'different-uuid',
    };
    store.addResult(mockResult);
    store.addResult(differentModelResult);

    const results = store.getResultsByModel(mockResult.modelId);
    expect(results.length).toBe(1);
    expect(results[0].modelId).toBe(mockResult.modelId);
  });

  it('returns latest result', () => {
    const olderResult = {
      ...mockResult,
      timestamp: '2024-03-19T10:00:00.000Z',
      uuid: 'older-uuid',
    };
    store.addResult(mockResult);
    store.addResult(olderResult);

    expect(store.latestResult).toEqual(olderResult);
  });

  it('marks result as submitted', () => {
    store.addResult(mockResult);
    store.markAsSubmitted(mockResult.uuid);

    const result = store.results.find(r => r.uuid === mockResult.uuid);
    expect(result?.submitted).toBe(true);
  });
});

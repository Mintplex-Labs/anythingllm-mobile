import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {BenchmarkResult} from '../utils/types';

export class BenchmarkStore {
  results: BenchmarkResult[] = [];

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'BenchmarkStore',
      properties: ['results'],
      storage: AsyncStorage,
    });
  }

  addResult(result: BenchmarkResult) {
    runInAction(() => {
      this.results.unshift(result); // Add new result at the beginning
    });
  }

  removeResult(timestamp: string) {
    runInAction(() => {
      this.results = this.results.filter(
        result => result.timestamp !== timestamp,
      );
    });
  }

  clearResults() {
    runInAction(() => {
      this.results = [];
    });
  }

  getResultsByModel(modelId: string): BenchmarkResult[] {
    return this.results.filter(result => result.modelId === modelId);
  }

  get latestResult(): BenchmarkResult | undefined {
    return this.results[0];
  }

  markAsSubmitted(uuid: string) {
    runInAction(() => {
      const result = this.results.find(r => r.uuid === uuid);
      if (result) {
        result.submitted = true;
      }
    });
  }
}

export const benchmarkStore = new BenchmarkStore();

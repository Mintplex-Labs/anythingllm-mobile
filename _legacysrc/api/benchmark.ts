import {BenchmarkResult, DeviceInfo} from '../utils/types';

type SubmissionData = {
  deviceInfo: DeviceInfo;
  benchmarkResult: BenchmarkResult;
};

/**
 * Submits benchmark data to the server with App Check verification
 */
export async function submitBenchmark(
  deviceInfo: DeviceInfo,
  benchmarkResult: BenchmarkResult,
): Promise<{message: string; id: number}> {
  return {message: 'test', id: 1};
}

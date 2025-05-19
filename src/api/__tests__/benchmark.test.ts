import axios from 'axios';
import {submitBenchmark} from '../benchmark';
import * as utils from '../../utils/fb';
import * as networkUtils from '../../utils';
import {urls} from '../../config';
import {DeviceInfo, BenchmarkResult} from '../../utils/types';

jest.mock('axios');
jest.mock('../../utils/fb');
jest.mock('../../utils', () => {
  const originalModule = jest.requireActual('../../utils');
  return {
    ...originalModule,
    checkConnectivity: jest.fn(),
    initializeAppCheck: jest.fn(),
    NetworkError: class NetworkError extends Error {
      constructor(message) {
        super(message);
        this.name = 'NetworkError';
      }
    },
    AppCheckError: class AppCheckError extends Error {
      constructor(message) {
        super(message);
        this.name = 'AppCheckError';
      }
    },
    ServerError: class ServerError extends Error {
      constructor(message) {
        super(message);
        this.name = 'ServerError';
      }
    },
  };
});

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedFb = utils as jest.Mocked<typeof utils>;
const mockedNetworkUtils = networkUtils as jest.Mocked<typeof networkUtils>;

describe('submitBenchmark', () => {
  const mockDeviceInfo: DeviceInfo = {
    model: 'Test Phone',
    systemName: 'iOS',
    systemVersion: '16.0',
    brand: 'Apple',
    cpuArch: ['arm64'],
    isEmulator: false,
    version: '16.0',
    buildNumber: '20A362',
    device: 'iPhone14,2',
    deviceId: 'test-device-id',
    totalMemory: 6144,
    chipset: 'Apple A15',
    cpu: 'hexa-core',
    cpuDetails: {
      cores: 6,
      processors: [
        {
          processor: '0',
          'model name': 'Apple A15',
          'cpu MHz': '3200',
          vendor_id: 'Apple',
        },
      ],
      socModel: 'Apple A15',
      features: ['fp16', 'neon'],
      hasFp16: true,
      hasDotProd: true,
      hasSve: false,
      hasI8mm: true,
    },
  };

  const mockBenchmarkResult: BenchmarkResult = {
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
    timestamp: new Date().toISOString(),
    modelId: 'test-model-id',
    modelName: 'Test Model',
    filename: 'test-model.gguf',
    uuid: 'test-uuid',
  };

  const mockAppCheckToken = 'mock-app-check-token';
  const mockResponse = {
    data: {
      message: 'Success',
      id: 123,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockedFb.getAppCheckToken.mockResolvedValue(mockAppCheckToken);
    mockedNetworkUtils.checkConnectivity.mockResolvedValue(true);
    mockedAxios.post.mockResolvedValue(mockResponse);
    mockedAxios.isAxiosError.mockReturnValue(true);
  });

  it('should successfully submit benchmark data', async () => {
    const result = await submitBenchmark(mockDeviceInfo, mockBenchmarkResult);

    // Verify AppCheck initialization and token retrieval
    expect(mockedFb.getAppCheckToken).toHaveBeenCalled();

    // Verify API call
    expect(mockedAxios.post).toHaveBeenCalledWith(
      urls.benchmarkSubmit(),
      {
        deviceInfo: mockDeviceInfo,
        benchmarkResult: mockBenchmarkResult,
      },
      {
        headers: {
          'X-Firebase-AppCheck': mockAppCheckToken,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    );

    // Verify response
    expect(result).toEqual({
      message: 'Success',
      id: 123,
    });
  });

  it('should throw NetworkError when there is no internet connection', async () => {
    mockedNetworkUtils.checkConnectivity.mockResolvedValue(false);

    await expect(
      submitBenchmark(mockDeviceInfo, mockBenchmarkResult),
    ).rejects.toThrowError(networkUtils.NetworkError);

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('should throw AppCheckError when AppCheck token is not available', async () => {
    mockedFb.getAppCheckToken.mockResolvedValue('');

    await expect(
      submitBenchmark(mockDeviceInfo, mockBenchmarkResult),
    ).rejects.toThrowError(networkUtils.AppCheckError);

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('should throw NetworkError on axios network error', async () => {
    const error = {
      isAxiosError: true,
      response: undefined,
    };
    mockedAxios.post.mockRejectedValue(error);

    await expect(
      submitBenchmark(mockDeviceInfo, mockBenchmarkResult),
    ).rejects.toThrowError(networkUtils.NetworkError);
  });

  it('should throw AppCheckError on 401/403 responses', async () => {
    const unauthorizedError = {
      isAxiosError: true,
      response: {
        status: 401,
        data: {},
      },
    };
    mockedAxios.post.mockRejectedValue(unauthorizedError);

    await expect(
      submitBenchmark(mockDeviceInfo, mockBenchmarkResult),
    ).rejects.toThrowError(networkUtils.AppCheckError);

    // Test 403 error
    const forbiddenError = {
      isAxiosError: true,
      response: {
        status: 403,
        data: {},
      },
    };
    mockedAxios.post.mockRejectedValue(forbiddenError);

    await expect(
      submitBenchmark(mockDeviceInfo, mockBenchmarkResult),
    ).rejects.toThrowError(networkUtils.AppCheckError);
  });

  it('should throw ServerError on 500+ responses', async () => {
    const serverError = {
      isAxiosError: true,
      response: {
        status: 500,
        data: {
          message: 'Internal Server Error',
        },
      },
    };
    mockedAxios.post.mockRejectedValue(serverError);

    await expect(
      submitBenchmark(mockDeviceInfo, mockBenchmarkResult),
    ).rejects.toThrowError(networkUtils.ServerError);
  });

  it('should throw ServerError with error message from server if available', async () => {
    const serverError = {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          message: 'Invalid benchmark data',
        },
      },
    };
    mockedAxios.post.mockRejectedValue(serverError);

    await expect(
      submitBenchmark(mockDeviceInfo, mockBenchmarkResult),
    ).rejects.toThrowError(networkUtils.ServerError);
  });

  it('should handle AppCheck initialization errors', async () => {
    mockedNetworkUtils.initializeAppCheck.mockImplementation(() => {
      throw new Error('AppCheck init error');
    });

    await expect(
      submitBenchmark(mockDeviceInfo, mockBenchmarkResult),
    ).rejects.toThrowError(networkUtils.AppCheckError);
  });
});

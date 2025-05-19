import {BenchmarkResult, DeviceInfo} from '../../src/utils/types';

export const mockResult: BenchmarkResult = {
  config: {
    pp: 512,
    tg: 256,
    pl: 1,
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
  oid: 'test-oid',
  rfilename: 'test-rfilename',
  peakMemoryUsage: {
    total: 1000000,
    used: 500000,
    percentage: 50,
  },
  wallTimeMs: 10000,
  submitted: false,
};

export const mockSubmittedResult: BenchmarkResult = {
  ...mockResult,
  submitted: true,
};

export const mockDeviceInfo: DeviceInfo = {
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

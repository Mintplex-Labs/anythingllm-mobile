import OnDeviceEmbedderProvider from "./onDevice";

export type EmbedderProvider = OnDeviceEmbedderProvider;
function getEmbedder(provider: string, config: { [key: string]: any } = {}): EmbedderProvider {
  switch (provider) {
    case 'native':
      return new OnDeviceEmbedderProvider()
    default:
      throw new Error(`Provider ${provider} not supported`);
  }
}

export default getEmbedder;
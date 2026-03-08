export const SUPPORTED_STORES = ["amazon.com", "amazon.co.uk", "ebay.com"];

export const isPlatformSupported = (platform: string) =>
  platform in SUPPORTED_STORES;


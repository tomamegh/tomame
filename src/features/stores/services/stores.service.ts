export const SUPPORTED_STORES = ["amazon.com", "amazon.co.uk", "ebay.com"];

export const isPlatformSupported = (url: string) => {
  try {
    const hostname = new URL(url).hostname.replace("www.", "");

    return SUPPORTED_STORES.some((store) =>
      hostname === store || hostname.endsWith(`.${store}`)
    );
  } catch {
    return false;
  }
};
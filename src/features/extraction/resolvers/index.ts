export { resolveProduct, continueResolve, DEFAULT_RESOLVERS } from "./chain";
export type { ResolveInput, HtmlFetcher } from "./chain";
export type { ExtractionResolver, ResolveContext, ResolverResult, ChainOutcome, HtmlFetch, HtmlSource, PartialProduct } from "./types";
export { mergeResult, hasRequiredFields, hasWeight, missingFields } from "./merge";

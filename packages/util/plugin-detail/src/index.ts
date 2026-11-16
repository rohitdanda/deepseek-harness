/**
 * Plugin detail documents without state: language chains, the `meta.detail` or README selection of a package, image
 * destinations beside a document, and read-only file sources for local packages.
 * @module @deepseek-ai/dsh-plugin-detail
 */

export {
  DetailFailure, fetchBody, joinPath, localFiles, README_NAMES,
  readmeByName, readmeName, type DetailFiles, type FetchedBody, type FoundFile, type ReadFile, type RemoteFileOptions,
} from './files.ts'
export { detailImage, languageChain, markdownOf, readPackageDocument, type PackageDocument } from './document.ts'
export { detailImageResponse, type DetailImage } from './response.ts'
export type { DetailFailureReason } from './types.ts'

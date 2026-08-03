// Storage Provider contract.
// Every provider MUST expose exactly these eight operations:
//   save(file, options), read(storageKey, options),
//   delete(storageKey), exists(storageKey), getPublicUrl(storageKey, options),
//   getThumbnailUrl(storageKey, options), getPreviewUrl(storageKey, options),
//   getDownloadUrl(storageKey, options)
// No additional public methods.

export class StorageProvider {
  constructor() {
    // 'local' | 'remote' — used internally to shape read() responses.
    this.kind = 'unknown'
    this.name = 'UNKNOWN'
  }

  async save(file, options) {
    throw new Error('save() must be implemented by the storage provider')
  }

  async read(storageKey, options) {
    throw new Error('read() must be implemented by the storage provider')
  }

  async delete(storageKey) {
    throw new Error('delete() must be implemented by the storage provider')
  }

  async exists(storageKey) {
    throw new Error('exists() must be implemented by the storage provider')
  }

  getPublicUrl(storageKey, options) {
    throw new Error('getPublicUrl() must be implemented by the storage provider')
  }

  getThumbnailUrl(storageKey, options) {
    throw new Error('getThumbnailUrl() must be implemented by the storage provider')
  }

  getPreviewUrl(storageKey, options) {
    throw new Error('getPreviewUrl() must be implemented by the storage provider')
  }

  getDownloadUrl(storageKey, options) {
    throw new Error('getDownloadUrl() must be implemented by the storage provider')
  }
}

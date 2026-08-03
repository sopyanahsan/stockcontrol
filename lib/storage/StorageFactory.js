// Storage Factory — resolves the active storage provider from STORAGE_PROVIDER.
import { STORAGE_PROVIDER } from './config'
import { LocalStorageProvider } from './providers/LocalStorageProvider'
import { CloudinaryStorageProvider } from './providers/CloudinaryStorageProvider'

export function createStorageProvider(name = STORAGE_PROVIDER) {
  const key = String(name || '').toUpperCase()
  switch (key) {
    case 'LOCAL':
      return new LocalStorageProvider()
    case 'CLOUDINARY':
      return new CloudinaryStorageProvider()
    default:
      throw new Error(`Unknown STORAGE_PROVIDER "${key}". Supported values: LOCAL, CLOUDINARY`)
  }
}

// Active provider (used for NEW uploads) — resolves from STORAGE_PROVIDER.
let activeProvider = null
export function getStorageProvider() {
  if (!activeProvider) activeProvider = createStorageProvider()
  return activeProvider
}

// Provider by name (used to READ/DELETE existing records regardless of the
// currently configured provider).
const byName = {}
export function getStorageProviderByName(name) {
  const key = String(name || STORAGE_PROVIDER || 'LOCAL').toUpperCase()
  if (!byName[key]) byName[key] = createStorageProvider(key)
  return byName[key]
}

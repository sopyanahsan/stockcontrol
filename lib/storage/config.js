// Storage configuration — read ONLY from environment.
// Changing STORAGE_PROVIDER switches the entire storage backend without code
// changes. Credentials are never hardcoded and never exposed to the client.

export const STORAGE_PROVIDER = (process.env.STORAGE_PROVIDER || 'LOCAL').toUpperCase()

export const CLOUDINARY_CONFIG = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
  folder: process.env.CLOUDINARY_FOLDER || 'wms-enterprise',
  resourceType: process.env.CLOUDINARY_RESOURCE_TYPE || 'auto',
  deliveryType: process.env.CLOUDINARY_DELIVERY_TYPE || 'upload',
}

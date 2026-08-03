// Reusable Enterprise Attachment Types (RCV-3.0).
// Future-ready: the same types are shared by Receiving, Putaway, Movement,
// Adjustment, Picking, Packing, Shipping, Cycle Count, Stock Opname and Audit.

export const ATTACHMENT_TYPES = {
  PURCHASE_ORDER: { key: 'PURCHASE_ORDER', label: 'Purchase Order' },
  DELIVERY_NOTE: { key: 'DELIVERY_NOTE', label: 'Delivery Note' },
  INVOICE: { key: 'INVOICE', label: 'Invoice' },
  ITEM_PHOTO: { key: 'ITEM_PHOTO', label: 'Item Photo' },
  DAMAGE_PHOTO: { key: 'DAMAGE_PHOTO', label: 'Damage Photo' },
  SEAL_PHOTO: { key: 'SEAL_PHOTO', label: 'Seal Photo' },
  LABEL_PHOTO: { key: 'LABEL_PHOTO', label: 'Label Photo' },
  TRUCK: { key: 'TRUCK', label: 'Truck' },
  VEHICLE: { key: 'VEHICLE', label: 'Vehicle' },
  BATCH_PHOTO: { key: 'BATCH_PHOTO', label: 'Batch Photo' },
  BARCODE_PHOTO: { key: 'BARCODE_PHOTO', label: 'Barcode Photo' },
  SERIAL_PHOTO: { key: 'SERIAL_PHOTO', label: 'Serial Number Photo' },
  OTHER: { key: 'OTHER', label: 'Other' },
}

export const ATTACHMENT_TYPE_LIST = Object.values(ATTACHMENT_TYPES)

// All warehouse transaction modules that can carry attachments.
export const ATTACHMENT_MODULES = [
  'Receiving',
  'Putaway',
  'Movement',
  'Adjustment',
  'Picking',
  'Packing',
  'Shipping',
  'Cycle Count',
  'Stock Opname',
  'Audit',
]

export const STORAGE_PROVIDERS = {
  LOCAL: 'LOCAL',
  CLOUDINARY: 'CLOUDINARY', // future
}

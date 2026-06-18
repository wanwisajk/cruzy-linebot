const { supabase } = require('../config/supabase');

function safeFileName(fileName) {
  return String(fileName || 'attachment')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'attachment';
}

function buildStoragePath({ entityType, entityId, storageDir, fileName }) {
  const root = storageDir || entityType;
  return `${root}/${entityId}/${Date.now()}_${safeFileName(fileName)}`;
}

async function uploadAttachmentBuffer({
  entityType,
  entityId,
  buffer,
  fileName,
  contentType = 'application/octet-stream',
  storageDir,
  bucket = 'documents',
}) {
  if (!entityType) throw new Error('entityType is required');
  if (!entityId) throw new Error('entityId is required');
  if (!buffer || !buffer.byteLength) throw new Error('buffer is required');

  const normalizedFileName = safeFileName(fileName);
  const storagePath = buildStoragePath({
    entityType,
    entityId,
    storageDir,
    fileName: normalizedFileName,
  });

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(storagePath);

  const { data: attachmentRecord, error: dbError } = await supabase
    .from('attachments')
    .insert([{
      entity_type: entityType,
      entity_id: entityId,
      file_url: publicUrlData.publicUrl,
      storage_bucket: bucket,
      storage_path: storagePath,
      file_name: normalizedFileName,
      file_type: contentType,
      file_size: buffer.byteLength,
    }])
    .select('*')
    .single();

  if (dbError) throw dbError;

  return attachmentRecord;
}

module.exports = {
  uploadAttachmentBuffer,
};

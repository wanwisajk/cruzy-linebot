const { supabase } = require('../../../../backend/config/supabase');
const { lineClient, blobClient } = require('../../../../backend/config/line');
const { syncSaleCashLedger, deleteSaleCashLedger } = require('../../../../backend/services/branchCashLedger.service');
const { logEvent } = require('../../utils/audit');

function isMissingColumnError(error) {
  const message = `${error && error.message || ''} ${error && error.details || ''}`;
  return error && (error.code === 'PGRST204' || /column|schema cache/i.test(message));
}

async function createDraftSale({
  branchId,
  date,
  cashAmount,
  creditAmount,
  transferAmount,
  totalSales,
  rawText,
  submittedBy,
  submittedAt,
  source,
  lineGroupId,
  lineUserId,
  submitterIdentity,
  submitterId,
  auditActorType,
  auditActorId,
  auditActorName,
}) {
  const payload = {
    sell_date: date || new Date().toISOString().slice(0,10),
    branch_id: branchId || null,
    cash_amount: cashAmount || 0,
    credit_amount: creditAmount || 0,
    transfer_amount: transferAmount || 0,
    total_amount: totalSales || 0,
    raw_text: rawText || '',
    submitted_by: submittedBy || null,
    submitted_at: submittedAt || new Date().toISOString(),
    status: 'draft',
    source: source || 'line',
    line_group_id: lineGroupId || null,
    line_user_id: lineUserId || null,
    line_notified: false,
    audit_actor_type: auditActorType || null,
    audit_actor_id: auditActorId ? String(auditActorId) : null,
    audit_actor_name: auditActorName || null,
  };

  let { data, error } = await supabase.from('sales').insert([payload]).select('*').single();
  if (error && isMissingColumnError(error)) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.line_notified;
    delete fallbackPayload.audit_actor_type;
    delete fallbackPayload.audit_actor_id;
    delete fallbackPayload.audit_actor_name;
    const retry = await supabase.from('sales').insert([fallbackPayload]).select('*').single();
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;

  await syncSaleCashLedger(data);

  await logEvent('sales_draft_created', {
    sale_id: data.id,
    actorType: auditActorType || submitterIdentity || (submittedBy ? 'employee' : 'line'),
    actorId: auditActorId || submitterId || submittedBy || null,
  });
  return data;
}

async function updateSaleStatus(saleId, status) {
  const payload = { status };
  if (status === 'confirmed' || status === 'rejected') {
    payload.line_notified = false;
  }

  let { data, error } = await supabase.from('sales').update(payload).eq('id', saleId).select('*').single();
  if (error && isMissingColumnError(error)) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.line_notified;
    const retry = await supabase.from('sales').update(fallbackPayload).eq('id', saleId).select('*').single();
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;

  if (status === 'rejected') {
    await deleteSaleCashLedger(data.id);
  } else {
    await syncSaleCashLedger(data);
  }

  await logEvent('sales_status_updated', { sale_id: saleId, status });
  return data;
}

async function updateSaleStatusWithTimestamp(saleId, status, options = {}) {
  const payload = {
    status,
    confirmed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (options.confirmedByUsername) {
    payload.confirmed_by = options.confirmedByUsername;
  }

  if (options.auditActorType) payload.audit_actor_type = options.auditActorType;
  if (options.auditActorId) payload.audit_actor_id = String(options.auditActorId);
  if (options.auditActorName) payload.audit_actor_name = options.auditActorName;

  if (typeof options.lineNotified === 'boolean') {
    payload.line_notified = options.lineNotified;
  } else if (status === 'confirmed' || status === 'rejected') {
    payload.line_notified = false;
  }

  let { data, error } = await supabase.from('sales').update(payload).eq('id', saleId).select('*').single();
  if (error && isMissingColumnError(error)) {
    const fallbackPayload = {
      status: payload.status,
      confirmed_at: payload.confirmed_at,
      updated_at: payload.updated_at,
    };
    if (options.auditActorType) fallbackPayload.audit_actor_type = options.auditActorType;
    if (options.auditActorId) fallbackPayload.audit_actor_id = String(options.auditActorId);
    if (options.auditActorName) fallbackPayload.audit_actor_name = options.auditActorName;
    if (typeof options.lineNotified === 'boolean') {
      fallbackPayload.line_notified = options.lineNotified;
    }
    const retry = await supabase
      .from('sales')
      .update(fallbackPayload)
      .eq('id', saleId)
      .select('*')
      .single();
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;

  if (status === 'rejected') {
    await deleteSaleCashLedger(data.id);
  } else {
    await syncSaleCashLedger(data);
  }

  await logEvent('sales_status_updated', {
    sale_id: saleId,
    status,
    confirmed_at: payload.confirmed_at,
    confirmed_by: payload.confirmed_by || null,
  });
  return data;
}

async function saveAttachments(saleId, messages) {
  if (!messages || messages.length === 0) return [];

  const attachments = [];

  for (const msg of messages) {
    try {
      let msgId = typeof msg === 'string' ? msg : null;
      if (!msgId && msg) {
        msgId = msg.id || msg.messageId || msg.message_id || (msg.message && msg.message.id);
      }

      if (!msgId) {
        console.warn("⚠️ ไม่พบ messageId ในโครงสร้างข้อมูล:", msg);
        continue;
      }

      const contentResponse = await blobClient.getMessageContent(msgId);
      
      const chunks = [];
      for await (const chunk of contentResponse) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      const currentType = typeof msg === 'object' ? (msg.type || msg.message_type) : 'image';
      const msgFileName = typeof msg === 'object' ? (msg.fileName || msg.filename || '') : '';
      
      const isPdf =
        currentType === 'file' &&
        String(msgFileName).toLowerCase().endsWith('.pdf');

      const contentType = isPdf ? 'application/pdf' : 'image/jpeg';
      const fileName = isPdf
        ? `line_${msgId}.pdf`
        : `line_${msgId}.jpg`;

      const storagePath = `sale/${saleId}/${Date.now()}_${fileName}`;

      // อัปโหลดไฟล์ขึ้น Supabase Storage โดยใช้ buffer ที่ประมวลผลสำเร็จแล้ว
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, buffer, {
          contentType,
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('documents')
        .getPublicUrl(storagePath);

      const { data: attachmentRecord, error: dbError } = await supabase
        .from('attachments')
        .insert([{
          entity_type: 'sale',
          entity_id: saleId,
          file_url: publicUrlData.publicUrl,
          storage_bucket: 'documents',
          storage_path: storagePath,
          file_name: fileName,
          file_type: contentType,
          file_size: buffer.byteLength,
        }])
        .select('*')
        .single();

      if (dbError) throw dbError;

      attachments.push(attachmentRecord);
    } catch (error) {
      console.error(`Error saving attachment:`, error);
    }
  }

  return attachments;
}

module.exports = { createDraftSale, updateSaleStatus, updateSaleStatusWithTimestamp, saveAttachments };

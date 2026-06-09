const { supabase } = require('../../../../backend/config/supabase');
// ดึงทั้ง lineClient และ blobClient ออกมาจากไฟล์คอนฟิกของคุณโดยตรง
const { lineClient, blobClient } = require('../../../../backend/config/line');
const { logEvent } = require('../../utils/audit');

async function createDraftSale({ branchId, date, cashAmount, creditAmount, transferAmount, totalSales, rawText, submittedBy }) {
  const payload = {
    sell_date: date || new Date().toISOString().slice(0,10),
    branch_id: branchId || null,
    cash_amount: cashAmount || 0,
    credit_amount: creditAmount || 0,
    transfer_amount: transferAmount || 0,
    total_amount: totalSales || 0,
    raw_text: rawText || '',
    submitted_by: submittedBy || null,
    submitted_at: new Date().toISOString(),
    status: 'draft',
  };

  const { data, error } = await supabase.from('sales').insert([payload]).select().single();
  if (error) throw error;

  await logEvent('sales_draft_created', { sale_id: data.id, actor: submittedBy });
  return data;
}

async function updateSaleStatus(saleId, status) {
  const { data, error } = await supabase.from('sales').update({ status }).eq('id', saleId).select().single();
  if (error) throw error;

  await logEvent('sales_status_updated', { sale_id: saleId, status });
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

      // ดึงข้อมูลรูปภาพจาก LINE Server โดยใช้ blobClient ของแท้จาก config (ได้เป็น ReadableStream)
      const contentResponse = await blobClient.getMessageContent(msgId);
      
      // ✅ แก้ไข: วนลูปอ่านข้อมูลทีละชิ้นจาก Stream แล้วรวบรวมเป็น Buffer ตัวเดียวโดยตรง
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

      // ดึง Public URL ของไฟล์
      const { data: publicUrlData } = supabase.storage
        .from('documents')
        .getPublicUrl(storagePath);

      // บันทึกข้อมูลลงฐานข้อมูล Supabase ตาราง 'attachments'
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
        .select()
        .single();

      if (dbError) throw dbError;

      attachments.push(attachmentRecord);
    } catch (error) {
      console.error(`Error saving attachment:`, error);
    }
  }

  return attachments;
}

module.exports = { createDraftSale, updateSaleStatus, saveAttachments };

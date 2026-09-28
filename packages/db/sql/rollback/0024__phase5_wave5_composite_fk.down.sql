-- 0024__phase5_wave5_composite_fk.down.sql — rollback موج ۵ (D21)
-- بازگشت به وضعیت 0023: FKهای تک‌ستونی قدیمی برمی‌گردند و گره‌های ترکیبی
-- و PKهای ترکیبی فیک حذف می‌شوند.
--
-- ⚠ داده‌ها: ستون‌های shadow (parent_clinic_id) — و مقادیر backfill شدهٔ
-- آن‌ها — عمداً حذف نمی‌شوند. حذف ستون، رابطهٔ نسخهٔ composite را برای
-- همیشه از بین می‌برد؛ نگه‌داشتن آن‌ها بی‌خطر است (هیچ مسیر کدی به
-- آن‌ها نمی‌نویسد پس مقدارش با تغییر داده‌های بعدی کهنه می‌شود) و اگر
-- D21 دوباره اعمال شد، backfill از صفر لازم نیست. حذف ستون‌ها فقط با
-- یک migration جدید انجام می‌شود که صراحتاً تصمیمِ حذف باشد.

-- ۱) FKهای تک‌ستونی قدیمی — از روی ستون‌های shadow تضمین‌پذیر نیستند؛
--    از روی گرهِ ترکیبیِ همنامِ ستون می‌سازیم (خودِ ترکیبی هنوز هست، پس
--    مقدارِ shadow و رابطهٔ composite با هم معتبرند).
ALTER TABLE aftercare_enrollments
  ADD CONSTRAINT aftercare_enrollments_sequence_id_fkey
  FOREIGN KEY (sequence_id) REFERENCES aftercare_sequences(id) NOT DEFERRABLE;
ALTER TABLE aftercare_enrollments
  ADD CONSTRAINT aftercare_enrollments_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES patients(id) NOT DEFERRABLE;
ALTER TABLE aftercare_enrollments
  ADD CONSTRAINT aftercare_enrollments_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES sessions(id) NOT DEFERRABLE;

ALTER TABLE message_log
  ADD CONSTRAINT message_log_enrollment_id_fkey
  FOREIGN KEY (enrollment_id) REFERENCES aftercare_enrollments(id) NOT DEFERRABLE;
ALTER TABLE message_log
  ADD CONSTRAINT message_log_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES sessions(id) NOT DEFERRABLE;
ALTER TABLE message_log
  ADD CONSTRAINT message_log_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES patients(id) NOT DEFERRABLE;

ALTER TABLE inbound_messages
  ADD CONSTRAINT inbound_messages_enrollment_id_fkey
  FOREIGN KEY (enrollment_id) REFERENCES aftercare_enrollments(id) NOT DEFERRABLE;
ALTER TABLE inbound_messages
  ADD CONSTRAINT inbound_messages_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES patients(id) NOT DEFERRABLE;
ALTER TABLE inbound_messages
  ADD CONSTRAINT inbound_messages_reply_to_message_id_fkey
  FOREIGN KEY (reply_to_message_id) REFERENCES message_log(id) NOT DEFERRABLE;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES patients(id) NOT DEFERRABLE;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES sessions(id) NOT DEFERRABLE;

ALTER TABLE invoice_items
  ADD CONSTRAINT invoice_items_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) NOT DEFERRABLE;
ALTER TABLE invoice_items
  ADD CONSTRAINT invoice_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) NOT DEFERRABLE;

-- ۲) گره‌های ترکیبی DROP می‌شوند
ALTER TABLE aftercare_enrollments
  DROP CONSTRAINT IF EXISTS aftercare_enrollments_sequence_fk;
ALTER TABLE aftercare_enrollments
  DROP CONSTRAINT IF EXISTS aftercare_enrollments_patient_fk;
ALTER TABLE aftercare_enrollments
  DROP CONSTRAINT IF EXISTS aftercare_enrollments_session_fk;

ALTER TABLE message_log
  DROP CONSTRAINT IF EXISTS message_log_enrollment_fk;
ALTER TABLE message_log
  DROP CONSTRAINT IF EXISTS message_log_session_fk;
ALTER TABLE message_log
  DROP CONSTRAINT IF EXISTS message_log_patient_fk;

ALTER TABLE inbound_messages
  DROP CONSTRAINT IF EXISTS inbound_messages_enrollment_fk;
ALTER TABLE inbound_messages
  DROP CONSTRAINT IF EXISTS inbound_messages_patient_fk;
ALTER TABLE inbound_messages
  DROP CONSTRAINT IF EXISTS inbound_messages_reply_fk;

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_patient_fk;
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_session_fk;

ALTER TABLE invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_invoice_fk;
ALTER TABLE invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_product_fk;

-- ۳) PKهای ترکیبی فیک DROP می‌شوند (پیش‌نیاز REFERENCES (id, clinic_id))
ALTER TABLE aftercare_enrollments
  DROP CONSTRAINT IF EXISTS aftercare_enrollments_id_clinic_key;
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_id_clinic_key;
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_id_clinic_key;
ALTER TABLE message_log
  DROP CONSTRAINT IF EXISTS message_log_id_clinic_key;
ALTER TABLE aftercare_sequences
  DROP CONSTRAINT IF EXISTS aftercare_sequences_id_clinic_key;

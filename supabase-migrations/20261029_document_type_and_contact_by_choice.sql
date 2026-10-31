-- 语言只决定显示：
-- 1) 自助入住按 payload.document_type（mainland_id / passport）决定公安码或护照；
--    未传 document_type 的旧客户端（Web 端）沿用 locale = 'zh-CN' 的原规则。
-- 2) 行李寄存去掉“中文登记只能预留手机号”的限制。
-- 仅修改两处判断，其余逻辑与线上版本逐行一致。

CREATE OR REPLACE FUNCTION public.submit_self_checkin_record(p_token text, p_payload jsonb)
 RETURNS TABLE(id uuid, status text, submitted_at timestamp with time zone, signature_record_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_record public.self_checkin_records%rowtype;
  v_rules public.checkin_rule_versions%rowtype;
  v_locale text := btrim(coalesce(p_payload ->> 'locale', 'zh-CN'));
  v_document_type text := nullif(btrim(coalesce(p_payload ->> 'document_type', '')), '');
  v_mainland_id boolean;
  v_guest_name text;
  v_contact text := btrim(coalesce(p_payload ->> 'contact', ''));
  v_phone_last4 text := nullif(btrim(coalesce(p_payload ->> 'phone_last4', '')), '');
  v_store_id text;
  v_order_platform text := nullif(btrim(coalesce(p_payload ->> 'order_platform', '')), '');
  v_checkin_date date;
  v_guest_note text := nullif(btrim(coalesce(p_payload ->> 'guest_note', '')), '');
  v_police_code text := btrim(coalesce(p_payload ->> 'police_code', ''));
  v_passport_path text := nullif(btrim(coalesce(p_payload ->> 'passport_photo_path', '')), '');
  v_visa_or_entry_path text := nullif(btrim(coalesce(p_payload ->> 'visa_or_entry_photo_path', '')), '');
  v_deposit_proof_path text := nullif(btrim(coalesce(p_payload ->> 'deposit_proof_path', '')), '');
  v_deposit_amount numeric;
  v_payment_channel text := coalesce(nullif(btrim(p_payload ->> 'payment_channel'), ''), 'other');
  v_paid_order public.self_checkin_deposit_orders%rowtype;
  v_signature_path text := nullif(btrim(coalesce(p_payload ->> 'signature_storage_path', '')), '');
  v_signature_record_id text := gen_random_uuid()::text;
  v_staff_name text;
begin
  if v_token = '' then raise exception '登记链接无效。'; end if;
  if v_locale not in ('zh-CN', 'en-US', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'ja-JP', 'ko-KR') then raise exception '语言版本无效。'; end if;
  if v_document_type is not null and v_document_type not in ('mainland_id', 'passport') then raise exception '证件类型无效。'; end if;
  v_mainland_id := coalesce(v_document_type = 'mainland_id', v_locale = 'zh-CN');

  select * into v_record from public.self_checkin_records where token = v_token for update;
  if not found or v_record.status not in ('pending_guest_submit', 'need_more_info') or v_record.archived_at is not null then raise exception '该登记记录不可提交。'; end if;
  v_guest_name := btrim(coalesce(v_record.guest_name, ''));
  if p_payload ? 'guest_name' and btrim(coalesce(p_payload ->> 'guest_name', '')) is distinct from v_guest_name then raise exception '旅客姓名不匹配，请联系前台更正。'; end if;


  v_store_id := btrim(coalesce(p_payload ->> 'store_id', v_record.store_id, 'sifang'));
  begin
    v_checkin_date := coalesce(nullif(p_payload ->> 'checkin_date', '')::date, v_record.checkin_date, timezone('Asia/Shanghai', now())::date);
  exception when others then raise exception '入住日期无效。'; end;
  begin
    v_deposit_amount := coalesce(nullif(p_payload ->> 'deposit_amount', '')::numeric, v_record.deposit_amount, 100);
  exception when others then raise exception '押金金额无效。'; end;

  if v_guest_name = '' or v_contact = '' or v_store_id = '' then raise exception '请完整填写基础信息。'; end if;
  if v_phone_last4 is not null and v_phone_last4 !~ '^[0-9]{4}$' then raise exception '手机号后四位必须为 4 位数字。'; end if;
  if v_order_platform is not null and v_order_platform not in ('携程', '美团', '飞猪', 'Booking', '小程序', '线下', '其他') then raise exception '订单平台无效。'; end if;

  if v_mainland_id then
    if v_police_code !~ '^[0-9]{6}$' then raise exception '公安登记验证码必须为 6 位数字。'; end if;
    if coalesce((p_payload ->> 'police_completed_confirmed')::boolean, false) is not true then raise exception '请确认已完成公安登记。'; end if;
  else
    if v_passport_path is null or v_passport_path !~ ('^self-checkin-documents/' || v_record.id::text || '/passport-[0-9]+[.]jpg$') then raise exception '请上传护照个人信息页。'; end if;
    if v_visa_or_entry_path is null or v_visa_or_entry_path !~ ('^self-checkin-documents/' || v_record.id::text || '/visa-or-entry-[0-9]+[.]jpg$') then raise exception '请上传签证页或入境记录。'; end if;
  end if;

  if v_deposit_amount < 0 then raise exception '押金金额不能为负数。'; end if;
  if v_payment_channel = 'wechat' then
    if v_deposit_amount <> 100 then raise exception '微信押金金额必须为 100 元。'; end if;
    select o.* into v_paid_order from public.self_checkin_deposit_orders o
      where o.record_id = v_record.id and o.status = 'paid' and o.amount_fen = 10000 and o.currency = 'CNY'
      order by o.paid_at desc limit 1;
    if not found then raise exception '微信押金尚未确认到账，请稍后重试。'; end if;
    if v_deposit_proof_path is not null then raise exception '微信支付无需上传押金截图。'; end if;
  elsif v_payment_channel = 'other' then
    if exists (select 1 from public.self_checkin_deposit_orders o
      where o.record_id = v_record.id and o.status in ('created','prepay_ready','paid','exception'))
      then raise exception '微信订单尚未关闭或已支付，不能切换其他方式。'; end if;
    if v_deposit_proof_path is null or v_deposit_proof_path !~ ('^self-checkin-documents/' || v_record.id::text || '/deposit-[0-9]+[.]jpg$') then raise exception '请刷新页面并上传押金支付成功截图后重新提交。'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'self-checkin-documents' and name = v_deposit_proof_path) then raise exception '押金截图未正确保存。'; end if;
  else
    raise exception '押金支付方式无效。';
  end if;
  if jsonb_typeof(p_payload -> 'confirmed_rules') <> 'array' or jsonb_array_length(p_payload -> 'confirmed_rules') = 0 then raise exception '请先完成入住须知签署。'; end if;
  if v_signature_path is null or v_signature_path !~ ('^self-checkin/' || v_record.id::text || '/signature-[0-9]+[.]png$') then raise exception '签名图片未正确保存。'; end if;

  select * into v_rules from public.checkin_rule_versions where is_current = true limit 1;
  if not found or v_rules.locales -> v_locale is null then raise exception '当前入住须知版本不存在。'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_rules.locales -> v_locale -> 'items') rule_item
    where not exists (
      select 1 from jsonb_array_elements(p_payload -> 'confirmed_rules') confirmed_rule
      where confirmed_rule ->> 'id' = rule_item ->> 'id'
        and coalesce((confirmed_rule ->> 'confirmed')::boolean, false) is true
    )
  ) then raise exception '请逐条确认完整入住须知。'; end if;

  select name into v_staff_name from public.staff_profiles where staff_profiles.id = v_record.created_by;
  insert into public.checkin_signing_records (
    id, status, guest_name, room_or_bed, is_private_room, slipper_number, checkin_date, language, rules_version, receipt_no, signed_at, created_by, created_by_name, contact_method, contact_value, confirmed_rules, rules_snapshot, signature_storage_path
  ) values (
    v_signature_record_id, 'signed_unexported', v_guest_name, coalesce(nullif(v_record.room_or_bed, ''), '待前台安排'), false, nullif(v_record.slipper_number, ''), v_checkin_date, v_locale, v_rules.version,
    'SF' || to_char(timezone('Asia/Shanghai', now()), 'YYYYMMDDHH24MISS') || substr(replace(v_signature_record_id, '-', ''), 1, 4), now(), v_record.created_by, coalesce(v_staff_name, 'Staff'), 'phone', v_contact, p_payload -> 'confirmed_rules', v_rules.locales -> v_locale, v_signature_path
  );

  update public.self_checkin_records set
    store_id = v_store_id, guest_name = v_guest_name, contact = v_contact, phone_last4 = v_phone_last4, order_platform = v_order_platform, checkin_date = v_checkin_date, guest_count = 1, guest_note = v_guest_note,
    police_code = case when v_mainland_id then v_police_code else null end,
    police_completed_confirmed = v_mainland_id, police_code_status = 'pending',
    passport_photo_path = case when v_mainland_id then null else v_passport_path end,
    visa_or_entry_photo_path = case when v_mainland_id then null else v_visa_or_entry_path end,
    deposit_amount = v_deposit_amount, deposit_status = case when v_record.deposit_status = 'refunded' then 'refunded' when v_payment_channel = 'wechat' then 'confirmed' when v_record.deposit_status = 'confirmed' then 'confirmed' else 'pending' end, deposit_payment_channel = v_payment_channel, deposit_confirmed_by_guest = true, deposit_proof_path = v_deposit_proof_path, signature_record_id = v_signature_record_id, status = 'submitted', submitted_at = now()
  where self_checkin_records.id = v_record.id
  returning self_checkin_records.id, self_checkin_records.status, self_checkin_records.submitted_at, self_checkin_records.signature_record_id into id, status, submitted_at, signature_record_id;
  return next;
end;
$function$;

-- 行李寄存：仅删除 “if v_locale = 'zh-CN' and v_contact_method = 'email'” 这一段。
DO $migration$
declare
  v_def text := pg_get_functiondef('public.submit_luggage_storage_record(text, jsonb)'::regprocedure);
  v_old text := E'  if v_locale = ''zh-CN'' and v_contact_method = ''email'' then\n    raise exception ''中文登记只能预留手机号。'';\n  end if;\n\n';
begin
  if position(v_old in v_def) = 0 then raise exception 'submit_luggage_storage_record 与预期不一致，已中止。'; end if;
  execute replace(v_def, v_old, '');
end;
$migration$;

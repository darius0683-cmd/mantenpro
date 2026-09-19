-- ============================================================================
-- Borrar UNA empresa (tenant) completa de MantenPro, sin afectar a las demás.
-- ============================================================================
-- CÓMO USARLO:
-- 1. Averigua el id de la empresa a borrar:
--      select id, name from companies order by name;
-- 2. En este archivo, busca y reemplaza TODAS las apariciones de
--    00000000-0000-0000-0000-000000000000 (sin comillas, aparece muchas veces)
--    por el id real de esa empresa. Usa buscar y reemplazar de tu editor de
--    texto para no dejar ninguna sin cambiar.
-- 3. Pega el resultado completo en el SQL Editor de Supabase y dale Run.
--    Está envuelto en una transacción: si algo falla, no se borra nada.
-- 4. Después de correr esto, ve a Authentication -> Users en el panel de
--    Supabase y borra manualmente el login de cada persona que trabajaba en
--    esa empresa. Este paso NO se puede hacer por SQL de forma segura, hay
--    que hacerlo desde el panel o con la Admin API de Supabase
--    (auth.admin.deleteUser), nunca desde el cliente.

begin;

-- ---- Nivel 3: líneas de documentos y detalles ----
delete from invoice_payment_attachments where payment_id in (select id from invoice_payments where invoice_id in (select id from invoices where company_id = '00000000-0000-0000-0000-000000000000'));
delete from invoice_payments where invoice_id in (select id from invoices where company_id = '00000000-0000-0000-0000-000000000000');
delete from invoice_items where invoice_id in (select id from invoices where company_id = '00000000-0000-0000-0000-000000000000');
delete from credit_note_items where credit_note_id in (select id from credit_notes where company_id = '00000000-0000-0000-0000-000000000000');
delete from purchase_payments where purchase_id in (select id from purchases where company_id = '00000000-0000-0000-0000-000000000000');
delete from purchase_items where purchase_id in (select id from purchases where company_id = '00000000-0000-0000-0000-000000000000');
delete from sales_order_items where sales_order_id in (select id from sales_orders where company_id = '00000000-0000-0000-0000-000000000000');
delete from quote_items where quote_id in (select id from quotes where company_id = '00000000-0000-0000-0000-000000000000');
delete from work_order_attachments where work_order_id in (select id from work_orders where company_id = '00000000-0000-0000-0000-000000000000');
delete from work_order_checklist_items where work_order_id in (select id from work_orders where company_id = '00000000-0000-0000-0000-000000000000');
delete from work_order_materials where work_order_id in (select id from work_orders where company_id = '00000000-0000-0000-0000-000000000000');
delete from checklist_template_items where template_id in (select id from checklist_templates where company_id = '00000000-0000-0000-0000-000000000000');

-- ---- Nivel 2: tablas con company_id propio, hijas de otra tabla nivel 1 ----
delete from work_order_technicians where company_id = '00000000-0000-0000-0000-000000000000';
delete from project_materials where company_id = '00000000-0000-0000-0000-000000000000';
delete from product_components where company_id = '00000000-0000-0000-0000-000000000000';
delete from tool_loans where company_id = '00000000-0000-0000-0000-000000000000';
delete from bank_transactions where company_id = '00000000-0000-0000-0000-000000000000';
delete from notifications where company_id = '00000000-0000-0000-0000-000000000000';
delete from push_subscriptions where company_id = '00000000-0000-0000-0000-000000000000';
delete from invites where company_id = '00000000-0000-0000-0000-000000000000';
delete from activity_log where company_id = '00000000-0000-0000-0000-000000000000';

-- ---- Nivel 1: documentos principales (ya sin hijos) ----
delete from credit_notes where company_id = '00000000-0000-0000-0000-000000000000';
delete from invoices where company_id = '00000000-0000-0000-0000-000000000000';
delete from sales_orders where company_id = '00000000-0000-0000-0000-000000000000';
delete from quotes where company_id = '00000000-0000-0000-0000-000000000000';
delete from work_orders where company_id = '00000000-0000-0000-0000-000000000000';
delete from incidents where company_id = '00000000-0000-0000-0000-000000000000';
delete from purchases where company_id = '00000000-0000-0000-0000-000000000000';
delete from cash_sessions where company_id = '00000000-0000-0000-0000-000000000000';
delete from checklist_templates where company_id = '00000000-0000-0000-0000-000000000000';
delete from projects where company_id = '00000000-0000-0000-0000-000000000000';
delete from recurring_contracts where company_id = '00000000-0000-0000-0000-000000000000';
delete from other_expenses where company_id = '00000000-0000-0000-0000-000000000000';
delete from tax_rates where company_id = '00000000-0000-0000-0000-000000000000';
delete from chart_of_accounts where company_id = '00000000-0000-0000-0000-000000000000';
delete from company_bank_accounts where company_id = '00000000-0000-0000-0000-000000000000';
delete from ncf_sequences where company_id = '00000000-0000-0000-0000-000000000000';

-- ---- Nivel 0: catálogos base (ya sin nada que los referencie) ----
delete from client_assets where company_id = '00000000-0000-0000-0000-000000000000';
delete from equipment where company_id = '00000000-0000-0000-0000-000000000000';
delete from tools where company_id = '00000000-0000-0000-0000-000000000000';
delete from tool_lists where company_id = '00000000-0000-0000-0000-000000000000';
delete from inventory_materials where company_id = '00000000-0000-0000-0000-000000000000';
delete from products where company_id = '00000000-0000-0000-0000-000000000000';
delete from clients where company_id = '00000000-0000-0000-0000-000000000000';
delete from suppliers where company_id = '00000000-0000-0000-0000-000000000000';
delete from technicians where company_id = '00000000-0000-0000-0000-000000000000';
delete from locations where company_id = '00000000-0000-0000-0000-000000000000';
delete from branches where company_id = '00000000-0000-0000-0000-000000000000';

-- ---- Usuarios y, al final, la empresa misma ----
-- (El login en auth.users de cada uno se borra aparte, desde el panel —ver nota arriba)
delete from profiles where company_id = '00000000-0000-0000-0000-000000000000';
delete from companies where id = '00000000-0000-0000-0000-000000000000';

commit;

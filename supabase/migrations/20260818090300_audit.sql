-- =====================================================================
-- MEP — Journal d'audit
--
-- « Toute modification du calculateur, du CA, des produits ou des seuils
--   doit y être tracée. »
--
-- Le déclencheur est générique : il enregistre l'avant / après en jsonb,
-- l'auteur et l'horodatage, pour chaque table sensible.
-- =====================================================================

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id text;
  v_before    jsonb;
  v_after     jsonb;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_after  := null;
  elsif tg_op = 'INSERT' then
    v_before := null;
    v_after  := to_jsonb(new);
  else
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
    -- Une mise à jour qui ne change rien ne mérite pas une ligne de journal.
    if v_before = v_after then
      return new;
    end if;
  end if;

  v_record_id := coalesce(v_after ->> 'id', v_before ->> 'id',
                          v_after ->> 'date', v_before ->> 'date');

  insert into public.audit_log (user_id, action, table_name, record_id, before, after)
  values (auth.uid(), tg_op, tg_table_name, v_record_id, v_before, v_after);

  return coalesce(new, old);
end;
$$;

comment on function public.audit_trigger() is
  'Trace avant/après en jsonb. SECURITY DEFINER : l''écriture dans audit_log est refusée aux rôles applicatifs.';

create trigger products_audit
  after insert or update or delete on public.products
  for each row execute function public.audit_trigger();

create trigger calculator_rules_audit
  after insert or update or delete on public.calculator_rules
  for each row execute function public.audit_trigger();

create trigger revenue_history_audit
  after insert or update or delete on public.revenue_history
  for each row execute function public.audit_trigger();

create trigger revenue_actuals_audit
  after insert or update or delete on public.revenue_actuals
  for each row execute function public.audit_trigger();

create trigger daily_forecast_audit
  after insert or update or delete on public.daily_forecast
  for each row execute function public.audit_trigger();

create trigger revenue_settings_audit
  after update on public.revenue_settings
  for each row execute function public.audit_trigger();

create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function public.audit_trigger();

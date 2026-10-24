-- Customer discovery controls: restock subscriptions, product Q&A, and review abuse reports.
create table public.stock_alerts (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade, email text not null check (length(email) between 3 and 320),
  created_at timestamptz not null default now(), notified_at timestamptz,
  unique(product_id, email)
);
alter table public.stock_alerts enable row level security;
revoke all on public.stock_alerts from public, anon, authenticated;
create function public.subscribe_stock_alert(p_slug text, p_email text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_product uuid; v_email text := lower(nullif(btrim(coalesce(p_email, '')), '')); begin
  if auth.uid() is not null then select email into v_email from auth.users where id = auth.uid(); end if;
  if v_email is null or position('@' in v_email) < 2 then raise exception 'Enter a valid email address.' using errcode = '22023'; end if;
  select id into v_product from public.products where slug = p_slug and is_published;
  if v_product is null then raise exception 'That product is not available.' using errcode = '22023'; end if;
  insert into public.stock_alerts(product_id, user_id, email) values(v_product, auth.uid(), v_email) on conflict(product_id,email) do nothing;
end; $$;
revoke all on function public.subscribe_stock_alert(text,text) from public; grant execute on function public.subscribe_stock_alert(text,text) to anon, authenticated;

create type public.question_status as enum ('pending','published','rejected');
create table public.product_questions (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question text not null check (length(question) between 10 and 500), answer text check (answer is null or length(answer) <= 1200),
  status public.question_status not null default 'pending', created_at timestamptz not null default now(), answered_at timestamptz
);
create index product_questions_product_idx on public.product_questions(product_id,status,created_at desc);
alter table public.product_questions enable row level security;
revoke all on public.product_questions from public, anon, authenticated;
create function public.get_product_questions(p_slug text, p_limit integer default 20, p_offset integer default 0)
returns table(id uuid, question text, answer text, created_at timestamptz) language sql stable security definer set search_path = '' as $$
 select q.id,q.question,q.answer,q.created_at from public.product_questions q join public.products p on p.id=q.product_id
 where p.slug=p_slug and p.is_published and q.status='published' order by q.created_at desc limit greatest(1,least(p_limit,50)) offset greatest(0,p_offset); $$;
revoke all on function public.get_product_questions(text,integer,integer) from public; grant execute on function public.get_product_questions(text,integer,integer) to anon,authenticated;
create function public.submit_product_question(p_slug text,p_question text) returns void language plpgsql security definer set search_path = '' as $$
declare v_product uuid; v_question text := btrim(coalesce(p_question,'')); begin
 if auth.uid() is null then raise exception 'Sign in to ask a question.' using errcode='42501'; end if;
 if length(v_question)<10 or length(v_question)>500 then raise exception 'Write between 10 and 500 characters.' using errcode='22023'; end if;
 select id into v_product from public.products where slug=p_slug and is_published;
 if v_product is null then raise exception 'That product is not available.' using errcode='22023'; end if;
 insert into public.product_questions(product_id,user_id,question) values(v_product,auth.uid(),v_question);
end; $$;
revoke all on function public.submit_product_question(text,text) from public,anon; grant execute on function public.submit_product_question(text,text) to authenticated;

create table public.review_reports (
  id uuid primary key default gen_random_uuid(), review_id uuid not null references public.product_reviews(id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason text not null check (length(reason) between 10 and 500), created_at timestamptz not null default now(), unique(review_id,reporter_id)
);
alter table public.review_reports enable row level security;
revoke all on public.review_reports from public,anon,authenticated;
create function public.report_product_review(p_review_id uuid,p_reason text) returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to report a review.' using errcode='42501'; end if;
 if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Tell us why this review should be checked.' using errcode='22023'; end if;
 if not exists(select 1 from public.product_reviews where id=p_review_id and status='published') then raise exception 'That review is no longer available.' using errcode='22023'; end if;
 insert into public.review_reports(review_id,reporter_id,reason) values(p_review_id,auth.uid(),btrim(p_reason)) on conflict(review_id,reporter_id) do nothing;
end; $$;
revoke all on function public.report_product_review(uuid,text) from public,anon; grant execute on function public.report_product_review(uuid,text) to authenticated;

create or replace function public.get_product_reviews_page(p_slug text,p_limit integer default 10,p_offset integer default 0,p_min_rating integer default 0)
returns table(id uuid,rating smallint,title text,body text,display_name text,created_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select r.id,r.rating,r.title,r.body,r.display_name,r.created_at from public.product_reviews r join public.products p on p.id=r.product_id
 where p.slug=p_slug and p.is_published and r.status='published' and r.rating >= greatest(0,least(p_min_rating,5))
 order by r.created_at desc limit greatest(1,least(p_limit,50)) offset greatest(0,p_offset); $$;
revoke all on function public.get_product_reviews_page(text,integer,integer,integer) from public; grant execute on function public.get_product_reviews_page(text,integer,integer,integer) to anon,authenticated;

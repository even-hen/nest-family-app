-- =====================================================================
-- 🚀 SUPABASE DATABASE SETTING & MIGRATION SCRIPT
-- =====================================================================
-- Run this script in the SQL Editor of your Supabase Dashboard.
-- This script sets up server-side weekly task distribution, real-time
-- in-app notifications, and registers user device push tokens.

-- ─────────────────────────────────────────────────────────────────────
-- 1. NOTIFICATIONS TABLE SETUP
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
    id uuid default gen_random_uuid() primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    group_id uuid not null references public.groups(id) on delete cascade,
    title text not null,
    body text not null,
    type text not null check (type in ('daily_summary', 'missed_task', 'weekly_report')),
    is_read boolean default false not null,
    created_at timestamp with time zone default now() not null
);

-- Add indexes for fast lookup of unread notifications
create index if not exists idx_notifications_user_unread on public.notifications(user_id, is_read);
create index if not exists idx_notifications_group on public.notifications(group_id);

-- Enable Row Level Security (RLS) to secure notification access
alter table public.notifications enable row level security;

-- Drop existing policies if any to prevent duplicate errors
drop policy if exists "Users can view their own notifications" on public.notifications;
drop policy if exists "Users can update their own notifications" on public.notifications;

-- Create policy to allow users to view only their own notifications
create policy "Users can view their own notifications"
on public.notifications for select
using (auth.uid() = user_id);

-- Create policy to allow users to mark their own notifications as read
create policy "Users can update their own notifications"
on public.notifications for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Enable Realtime for notifications to allow instant app updates
alter table public.notifications replica identity full;
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;
alter publication supabase_realtime add table public.notifications;

-- ─────────────────────────────────────────────────────────────────────
-- 2. USER DEVICE & GROUP SCHEMA UPDATES
-- ─────────────────────────────────────────────────────────────────────
-- Add column to store device push tokens (Expo push tokens)
alter table public.users add column if not exists expo_push_token text;

-- Add column to toggle weekly shuffling of tasks (ON: rotate, OFF: keep same assignments)
-- Note: Reusing the existing auto_distribution column already present in the groups table!

-- ─────────────────────────────────────────────────────────────────────
-- 3. THE WEEKLY AUTO-DISTRIBUTION ENGINE (PL/pgSQL)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.generate_weekly_assignments()
returns void as $$
declare
    v_group record;
    v_week_start date;
    v_task record;
    v_user record;
    v_total_resource integer;
    v_total_weekly_cost integer;
    v_assigned_to uuid;
    v_eligible_count integer;
    v_day_idx integer;
    v_day_offset integer;
    v_assignment_date date;
    v_notif_body text;
    v_group_tz text;
    v_local_now timestamp;
begin
    -- Loop through all active family groups
    for v_group in select id, auto_distribution, created_by from public.groups loop
        
        -- Resolve the group creator's timezone
        select u.timezone into v_group_tz
        from public.users u
        where u.id = v_group.created_by;

        v_local_now := now() at time zone coalesce(v_group_tz, 'UTC');
        v_week_start := date_trunc('week', v_local_now)::date;

        -- Only proceed if it is Monday locally (dow = 1) and local hour is < 2
        if extract(dow from v_local_now) != 1 or extract(hour from v_local_now) >= 2 then
            continue;
        end if;

        -- Prevent duplicate weekly generation for this group
        if exists (
            select 1 from public.assignments 
            where group_id = v_group.id and week_start = v_week_start::text limit 1
        ) then
            continue; -- Already generated for this week
        end if;

        -- Fetch total resource capacity in group
        select coalesce(sum(resource), 0) into v_total_resource 
        from public.users 
        where group_id = v_group.id;

        if v_total_resource = 0 then
            continue; -- No assignable members
        end if;

        -- Create temporary table to track dynamically calculated capacities & assignments
        create temp table if not exists temp_user_capacities (
            user_id uuid primary key,
            type text,
            resource integer,
            target_capacity numeric,
            allocated_points integer default 0
        ) on commit drop;
        
        truncate table temp_user_capacities;

        -- Calculate total cost of active tasks for this group
        -- Weekly cost = complexity * count of days task is active
        select coalesce(sum(complexity * coalesce(cardinality(week_days), 0)), 0) into v_total_weekly_cost
        from public.tasks
        where group_id = v_group.id and is_active = true;

        -- Populate member capacities
        insert into temp_user_capacities (user_id, type, resource, target_capacity)
        select id, type, resource, 
               (resource::numeric / v_total_resource) * v_total_weekly_cost
        from public.users
        where group_id = v_group.id;

        -- A. Process manual (static) assignments first to reserve capacity
        for v_task in 
            select id, complexity, week_days, assigned_to 
            from public.tasks 
            where group_id = v_group.id and is_active = true and auto = false and assigned_to is not null
        loop
            update temp_user_capacities 
            set allocated_points = allocated_points + (v_task.complexity * coalesce(cardinality(v_task.week_days), 0))
            where user_id = v_task.assigned_to;
        end loop;

        -- B. Distribute auto tasks
        for v_task in 
            select id, title, complexity, week_days, available_for, assigned_to, auto
            from public.tasks 
            where group_id = v_group.id and is_active = true
            order by (complexity * coalesce(cardinality(week_days), 0)) desc -- Descending cost
        loop
            -- Resolve assignee for this task
            v_assigned_to := null;

            if v_task.auto = false then
                -- Manual task retains its assignee
                v_assigned_to := v_task.assigned_to;
            else
                -- Auto-task
                if v_group.auto_distribution = true then
                    -- Rotation enabled: Pick the eligible user with the most remaining capacity
                    select user_id into v_assigned_to
                    from temp_user_capacities
                    where type = any(v_task.available_for) or cardinality(v_task.available_for) = 0
                    order by (target_capacity - allocated_points) desc, random()
                    limit 1;
                    
                    if v_assigned_to is not null then
                        -- Update capacity and save assignee to base tasks table
                        update temp_user_capacities 
                        set allocated_points = allocated_points + (v_task.complexity * coalesce(cardinality(v_task.week_days), 0))
                        where user_id = v_assigned_to;

                        update public.tasks set assigned_to = v_assigned_to where id = v_task.id;
                    end if;
                else
                    -- Rotation disabled: Keep current task's assignee (fallback if null)
                    if v_task.assigned_to is not null then
                        v_assigned_to := v_task.assigned_to;
                    else
                        -- Fallback: Assign using capacity
                        select user_id into v_assigned_to
                        from temp_user_capacities
                        where type = any(v_task.available_for) or cardinality(v_task.available_for) = 0
                        order by (target_capacity - allocated_points) desc
                        limit 1;

                        if v_assigned_to is not null then
                            update temp_user_capacities 
                            set allocated_points = allocated_points + (v_task.complexity * coalesce(cardinality(v_task.week_days), 0))
                            where user_id = v_assigned_to;

                            update public.tasks set assigned_to = v_assigned_to where id = v_task.id;
                        end if;
                    end if;
                end if;
            end if;

            -- C. Generate pending daily assignments for active days
            if v_assigned_to is not null then
                foreach v_day_idx in array v_task.week_days loop
                    -- Convert day index (0=Sun, 1=Mon, ..., 6=Sat) to calendar date
                    v_day_offset := case 
                        when v_day_idx = 0 then 6 -- Sunday is 6 days after Monday
                        else v_day_idx - 1
                    end;
                    v_assignment_date := v_week_start + v_day_offset;

                    insert into public.assignments (
                        task_id, group_id, title, complexity, week_days, 
                        assigned_to, status, week_start, date, done_at, skipped_at
                    ) values (
                        v_task.id, v_group.id, v_task.title, v_task.complexity, v_task.week_days,
                        v_assigned_to, 'pending', v_week_start::text, v_assignment_date::text, null, null
                    );
                end loop;
            end if;
        end loop;

        -- D. Generate real-time server-side in-app notifications for each member
        for v_user in 
            select u.id, u.name, coalesce(count(a.id), 0) as task_count
            from public.users u
            left join public.assignments a on a.assigned_to = u.id and a.week_start = v_week_start::text
            where u.group_id = v_group.id
            group by u.id, u.name
        -- Note: v_user.task_count needs to be cast or checked
        loop
            if v_user.task_count > 0 then
                v_notif_body := 'Hey ' || v_user.name || '! You have ' || v_user.task_count || ' task(s) scheduled for this week. Have a great week ahead!';
                
                insert into public.notifications (user_id, group_id, title, body, type, is_read)
                values (v_user.id, v_group.id, '📋 Weekly Chores Scheduled', v_notif_body, 'daily_summary', false);
            end if;
        end loop;

        drop table temp_user_capacities;

    end loop;
end;
$$ language plpgsql;

-- ─────────────────────────────────────────────────────────────────────
-- 4. SERVER-SIDE ASSIGNMENTS SWEEP JOB
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.sweep_past_assignments()
returns void as $$
declare
    v_group record;
    v_group_tz text;
    v_local_today date;
begin
    for v_group in select g.id, g.created_by from public.groups g loop
        -- Resolve the group creator's timezone
        select u.timezone into v_group_tz
        from public.users u where u.id = v_group.created_by;

        v_local_today := (now() at time zone coalesce(v_group_tz, 'UTC'))::date;

        -- Mark past pending assignments as skipped
        update public.assignments
        set status = 'skipped', skipped_at = now()
        where group_id = v_group.id
          and status = 'pending'
          and date::date < v_local_today;
    end loop;
end;
$$ language plpgsql;

-- ─────────────────────────────────────────────────────────────────────
-- 5. SERVER-SIDE PUSH NOTIFICATION SYSTEM
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.send_push_notifications()
returns void as $$
declare
    v_user record;
    v_local_now timestamp;
    v_local_hour text;
    v_today date;
    v_yesterday date;
    v_pending_count integer;
    v_skipped_count integer;
    v_notif_body text;
    v_notif_title text;
begin
    for v_user in
        select id, name, group_id, timezone, notification_time, expo_push_token, type
        from public.users
        where group_id is not null
          and notification_time is not null
    loop
        v_local_now := now() at time zone coalesce(v_user.timezone, 'UTC');
        v_local_hour := to_char(v_local_now, 'HH24') || ':00';

        -- Only fire if the current local hour matches the user's preferred time
        if v_local_hour != v_user.notification_time then
            continue;
        end if;

        v_today := v_local_now::date;
        v_yesterday := v_today - 1;

        -- Count today's pending tasks
        select count(*) into v_pending_count
        from public.assignments
        where assigned_to = v_user.id 
          and date = v_today::text 
          and status = 'pending';

        -- Count yesterday's skipped tasks
        select count(*) into v_skipped_count
        from public.assignments
        where assigned_to = v_user.id 
          and date = v_yesterday::text 
          and status = 'skipped';

        -- Daily Summary notification
        if v_pending_count > 0 then
            v_notif_title := '📋 Daily Chores';
            v_notif_body := 'You have ' || v_pending_count || ' task(s) for today. Let''s get them done!';
            
            -- ONLY insert if not already exists today (checking both server-side and client-side titles)
            if not exists (
                select 1 from public.notifications 
                where user_id = v_user.id 
                  and type = 'daily_summary' 
                  and (title = v_notif_title or title = '📋 Today''s Chores')
                  and created_at::date = v_today
            ) then
                insert into public.notifications (user_id, group_id, title, body, type, is_read)
                values (v_user.id, v_user.group_id, v_notif_title, v_notif_body, 'daily_summary', false);

                -- Send push notification via pg_net if available
                if v_user.expo_push_token is not null and v_user.expo_push_token like 'ExponentPushToken[%]' then
                    if exists (select 1 from pg_extension where extname = 'pg_net') then
                        execute 'select net.http_post(
                            url := ''https://exp.host/--/api/v2/push/send'',
                            headers := ''{"Content-Type": "application/json"}''::jsonb,
                            body := $1
                        )' using json_build_object(
                            'to', v_user.expo_push_token,
                            'title', v_notif_title,
                            'body', v_notif_body,
                            'sound', 'default'
                        )::jsonb;
                    end if;
                end if;
            end if;
        end if;

        -- Missed Task notification
        if v_skipped_count > 0 then
            v_notif_title := '⚠️ Missed Tasks';
            v_notif_body := v_skipped_count || ' task(s) from yesterday were missed.';
            
            -- ONLY insert if not already exists today (checking both server-side and client-side titles)
            if not exists (
                select 1 from public.notifications 
                where user_id = v_user.id 
                  and type = 'missed_task' 
                  and (title = v_notif_title or title = '⚠️ Yesterday''s Skipped Chores')
                  and created_at::date = v_today
            ) then
                insert into public.notifications (user_id, group_id, title, body, type, is_read)
                values (v_user.id, v_user.group_id, v_notif_title, v_notif_body, 'missed_task', false);

                -- Send push notification via pg_net if available
                if v_user.expo_push_token is not null and v_user.expo_push_token like 'ExponentPushToken[%]' then
                    if exists (select 1 from pg_extension where extname = 'pg_net') then
                        execute 'select net.http_post(
                            url := ''https://exp.host/--/api/v2/push/send'',
                            headers := ''{"Content-Type": "application/json"}''::jsonb,
                            body := $1
                        )' using json_build_object(
                            'to', v_user.expo_push_token,
                            'title', v_notif_title,
                            'body', v_notif_body,
                            'sound', 'default'
                        )::jsonb;
                    end if;
                end if;
            end if;
        end if;

        -- Weekly Report notification (Monday, Adults only)
        if extract(dow from v_local_now) = 1 and v_user.type = 'Adult' then
            v_notif_title := '📊 Weekly Report';
            v_notif_body := 'Weekly performance report is ready. Check the Members tab for details.';
            
            -- ONLY insert if not already exists today (checking both server-side and client-side titles)
            if not exists (
                select 1 from public.notifications 
                where user_id = v_user.id 
                  and type = 'weekly_report' 
                  and (title = v_notif_title or title = '📊 Weekly Missed Tasks Report')
                  and created_at::date = v_today
            ) then
                insert into public.notifications (user_id, group_id, title, body, type, is_read)
                values (v_user.id, v_user.group_id, v_notif_title, v_notif_body, 'weekly_report', false);

                -- Send push notification via pg_net if available
                if v_user.expo_push_token is not null and v_user.expo_push_token like 'ExponentPushToken[%]' then
                    if exists (select 1 from pg_extension where extname = 'pg_net') then
                        execute 'select net.http_post(
                            url := ''https://exp.host/--/api/v2/push/send'',
                            headers := ''{"Content-Type": "application/json"}''::jsonb,
                            body := $1
                        )' using json_build_object(
                            'to', v_user.expo_push_token,
                            'title', v_notif_title,
                            'body', v_notif_body,
                            'sound', 'default'
                        )::jsonb;
                    end if;
                end if;
            end if;
        end if;
    end loop;
end;
$$ language plpgsql;

-- ─────────────────────────────────────────────────────────────────────
-- 6. REGISTER THE CRON TRIGGERS VIA PG_CRON
-- ─────────────────────────────────────────────────────────────────────
-- Ensure the pg_cron extension is loaded
create extension if not exists pg_cron;

-- Schedule weekly generation to run every hour
select cron.schedule(
    'generate-weekly-assignments-cron',
    '0 * * * *', -- Every hour
    'select public.generate_weekly_assignments();'
);

-- Schedule sweep past assignments to run every hour
select cron.schedule(
    'sweep-past-assignments-cron',
    '0 * * * *', -- Every hour
    'select public.sweep_past_assignments();'
);

-- Schedule send push notifications to run every hour
select cron.schedule(
    'send-push-notifications-cron',
    '0 * * * *', -- Every hour
    'select public.send_push_notifications();'
);

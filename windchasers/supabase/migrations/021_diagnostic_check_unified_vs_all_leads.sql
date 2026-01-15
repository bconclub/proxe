-- Diagnostic Migration: Check what's in unified_leads vs all_leads
-- This is a READ-ONLY diagnostic query - it won't modify anything
-- Run this first to see what fields exist before making changes

-- Step 1: Check all_leads table structure
DO $$
DECLARE
    all_leads_columns TEXT;
    unified_leads_columns TEXT;
BEGIN
    -- Get all_leads columns
    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
    INTO all_leads_columns
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'all_leads';
    
    -- Get unified_leads view columns
    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
    INTO unified_leads_columns
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'unified_leads';
    
    RAISE NOTICE '=== all_leads TABLE COLUMNS ===';
    RAISE NOTICE '%', all_leads_columns;
    RAISE NOTICE '';
    RAISE NOTICE '=== unified_leads VIEW COLUMNS ===';
    RAISE NOTICE '%', unified_leads_columns;
    RAISE NOTICE '';
END $$;

-- Step 2: Check if scoring fields exist in all_leads
SELECT 
    'all_leads' as source,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'all_leads' 
        AND column_name = 'lead_score'
    ) THEN 'YES' ELSE 'NO' END as has_lead_score,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'all_leads' 
        AND column_name = 'lead_stage'
    ) THEN 'YES' ELSE 'NO' END as has_lead_stage,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'all_leads' 
        AND column_name = 'sub_stage'
    ) THEN 'YES' ELSE 'NO' END as has_sub_stage,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'all_leads' 
        AND column_name = 'stage_override'
    ) THEN 'YES' ELSE 'NO' END as has_stage_override,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'all_leads' 
        AND column_name = 'last_scored_at'
    ) THEN 'YES' ELSE 'NO' END as has_last_scored_at,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'all_leads' 
        AND column_name = 'is_active_chat'
    ) THEN 'YES' ELSE 'NO' END as has_is_active_chat,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'all_leads' 
        AND column_name = 'booking_date'
    ) THEN 'YES' ELSE 'NO' END as has_booking_date,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'all_leads' 
        AND column_name = 'booking_time'
    ) THEN 'YES' ELSE 'NO' END as has_booking_time,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'all_leads' 
        AND column_name = 'status'
    ) THEN 'YES' ELSE 'NO' END as has_status;

-- Step 3: Check if scoring fields exist in unified_leads view
SELECT 
    'unified_leads' as source,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'unified_leads' 
        AND column_name = 'lead_score'
    ) THEN 'YES' ELSE 'NO' END as has_lead_score,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'unified_leads' 
        AND column_name = 'lead_stage'
    ) THEN 'YES' ELSE 'NO' END as has_lead_stage,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'unified_leads' 
        AND column_name = 'sub_stage'
    ) THEN 'YES' ELSE 'NO' END as has_sub_stage,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'unified_leads' 
        AND column_name = 'stage_override'
    ) THEN 'YES' ELSE 'NO' END as has_stage_override,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'unified_leads' 
        AND column_name = 'last_scored_at'
    ) THEN 'YES' ELSE 'NO' END as has_last_scored_at,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'unified_leads' 
        AND column_name = 'is_active_chat'
    ) THEN 'YES' ELSE 'NO' END as has_is_active_chat,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'unified_leads' 
        AND column_name = 'booking_date'
    ) THEN 'YES' ELSE 'NO' END as has_booking_date,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'unified_leads' 
        AND column_name = 'booking_time'
    ) THEN 'YES' ELSE 'NO' END as has_booking_time,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'unified_leads' 
        AND column_name = 'status'
    ) THEN 'YES' ELSE 'NO' END as has_status;

-- Step 4: Get sample data from all_leads (only select columns that definitely exist)
-- Basic columns that should always exist
SELECT 
    'Sample from all_leads' as info,
    id,
    customer_name,
    email,
    phone,
    first_touchpoint,
    last_touchpoint,
    created_at,
    last_interaction_at,
    brand,
    unified_context
FROM all_leads
LIMIT 1;

-- Step 4b: Check if scoring columns exist and show their values (if they exist)
-- This will only work if the columns exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'all_leads' AND column_name = 'lead_score') THEN
        RAISE NOTICE 'lead_score column EXISTS in all_leads';
    ELSE
        RAISE NOTICE 'lead_score column DOES NOT EXIST in all_leads';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'all_leads' AND column_name = 'lead_stage') THEN
        RAISE NOTICE 'lead_stage column EXISTS in all_leads';
    ELSE
        RAISE NOTICE 'lead_stage column DOES NOT EXIST in all_leads';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'all_leads' AND column_name = 'booking_date') THEN
        RAISE NOTICE 'booking_date column EXISTS in all_leads';
    ELSE
        RAISE NOTICE 'booking_date column DOES NOT EXIST in all_leads';
    END IF;
END $$;

-- Step 5: Get sample data from unified_leads (only select columns that definitely exist)
-- Basic columns that should always exist in the view
SELECT 
    'Sample from unified_leads' as info,
    id,
    name,
    email,
    phone,
    first_touchpoint,
    last_touchpoint,
    timestamp,
    last_interaction_at,
    brand,
    metadata,
    unified_context
FROM unified_leads
LIMIT 1;

-- Step 5b: Check if scoring columns exist in unified_leads view
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'unified_leads' AND column_name = 'lead_score') THEN
        RAISE NOTICE 'lead_score column EXISTS in unified_leads';
    ELSE
        RAISE NOTICE 'lead_score column DOES NOT EXIST in unified_leads';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'unified_leads' AND column_name = 'lead_stage') THEN
        RAISE NOTICE 'lead_stage column EXISTS in unified_leads';
    ELSE
        RAISE NOTICE 'lead_stage column DOES NOT EXIST in unified_leads';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'unified_leads' AND column_name = 'booking_date') THEN
        RAISE NOTICE 'booking_date column EXISTS in unified_leads';
    ELSE
        RAISE NOTICE 'booking_date column DOES NOT EXIST in unified_leads';
    END IF;
END $$;

-- Step 6: Check RLS policies on all_leads
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'all_leads'
ORDER BY policyname;

-- Step 7: Check grants on unified_leads
SELECT 
    grantee,
    privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' 
AND table_name = 'unified_leads'
ORDER BY grantee, privilege_type;

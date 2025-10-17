-- Migration script to change signals.value from numeric to text
-- This allows storing complex JSON data from Smartcar signals

-- First, add a new text column
ALTER TABLE public.signals ADD COLUMN value_text text;

-- Copy existing numeric values to text column (convert to string)
UPDATE public.signals SET value_text = value::text WHERE value IS NOT NULL;

-- Drop the old numeric column
ALTER TABLE public.signals DROP COLUMN value;

-- Rename the new column to the original name
ALTER TABLE public.signals RENAME COLUMN value_text TO value;

-- Add comment to document the change
COMMENT ON COLUMN public.signals.value IS 'Flexible text field storing JSON or primitive values from Smartcar signals';

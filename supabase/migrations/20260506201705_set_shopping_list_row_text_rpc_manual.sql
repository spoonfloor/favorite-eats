-- Aligns local migration history with Favorite Eats production: this version was
-- applied once via Supabase MCP (`set_shopping_list_row_text_rpc_manual`).
-- Greenfield installs: `catalog.set_shopping_list_row_text` is defined in
-- 20260509120000_set_shopping_list_row_text_rpc.sql (runs later in the chain).

select 1;

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { fileId, newName } = await req.json();

    if (!fileId || !newName) {
      return new Response(JSON.stringify({ error: 'Missing fileId or newName' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's clinic
    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if file exists and belongs to user's clinic
    const { data: existingFile, error: fileError } = await supabase
      .from('file_assets')
      .select('*')
      .eq('id', fileId)
      .eq('clinic_id', profile.clinic_id)
      .single();

    if (fileError || !existingFile) {
      return new Response(JSON.stringify({ error: 'File not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for duplicate name in same consultation
    if (existingFile.consult_id) {
      const { data: duplicate } = await supabase
        .from('file_assets')
        .select('id')
        .eq('consult_id', existingFile.consult_id)
        .eq('clinic_id', profile.clinic_id)
        .neq('id', fileId)
        .ilike('storage_key', `%${newName}%`)
        .single();

      if (duplicate) {
        return new Response(JSON.stringify({ error: 'A file with this name already exists in this consultation' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Update the storage_key to reflect the new name (keep the path, just change filename)
    const parts = existingFile.storage_key.split('/');
    parts[parts.length - 1] = newName;
    const newStorageKey = parts.join('/');

    // Update file record
    const { error: updateError } = await supabase
      .from('file_assets')
      .update({ storage_key: newStorageKey })
      .eq('id', fileId);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to rename file' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Rename file error:', error);
    return new Response(JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

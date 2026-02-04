import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user before processing
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase credentials');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify user authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message || 'No user found');
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    const { species, breed, dateOfBirth } = await req.json();

    if (!species) {
      throw new Error('species is required');
    }

    // Calculate age class from date of birth
    let ageClass = 'adult';
    if (dateOfBirth) {
      const birthDate = new Date(dateOfBirth);
      const now = new Date();
      const ageYears = (now.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      
      if (ageYears < 1) {
        ageClass = species.toLowerCase() === 'cat' ? 'kitten' : 'puppy';
      } else if (ageYears >= 7) {
        ageClass = 'senior';
      }
    }

    console.log(`Fetching normal ranges for species: ${species}, breed: ${breed || 'any'}, age_class: ${ageClass}`);

    // Query normal ranges - try breed-specific first, then species-general
    let { data: ranges, error: rangesError } = await supabaseClient
      .from('species_normal_ranges')
      .select('*')
      .eq('species', species)
      .eq('age_class', ageClass);

    if (rangesError) throw rangesError;

    // If breed is specified, try to find breed-specific ranges first
    let breedSpecificRanges = [];
    if (breed && ranges) {
      breedSpecificRanges = ranges.filter(r => r.breed && r.breed.toLowerCase() === breed.toLowerCase());
    }

    // Use breed-specific if available, otherwise use general species ranges
    const normalRanges = breedSpecificRanges.length > 0 ? breedSpecificRanges : ranges?.filter(r => !r.breed) || [];

    // Build response object with normal ranges
    const result: any = {};
    
    normalRanges.forEach(range => {
      const param = range.parameter.toLowerCase().replace(' ', '_');
      result[param] = {
        min: range.min_value,
        max: range.max_value,
        unit: range.unit,
        typical: range.min_value && range.max_value 
          ? String(Math.round((Number(range.min_value) + Number(range.max_value)) / 2))
          : 'normal',
        notes: range.notes
      };
    });

    // Add default descriptive values if not in database
    if (!result.crt) {
      result.crt = { typical: '<2 seconds', unit: 'seconds' };
    }
    if (!result.mucous_membranes) {
      result.mucous_membranes = { typical: 'Pink and moist' };
    }

    console.log('Normal ranges result:', JSON.stringify(result, null, 2));

    return new Response(
      JSON.stringify({ normalRanges: result, ageClass }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in get-normal-ranges function:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request', code: 'INTERNAL_ERROR' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

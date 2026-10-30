import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BRANDS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR97zMe92tmYcr1A_KfEVQoxgUID3CBIVPzPknJ3DCIUO3Ov0BxYBza_pPPCqzDNHuNM0BtwCV6bPkl/pub?gid=305510317&single=true&output=csv";
const CACHE_TABLE = "csv_cache";
const CACHE_KEY = "brands";
const CACHE_TTL_SECONDS = 60;

interface Brand {
  id: number;
  name: string;
  logo: string;
  instagram: string;
  province: string;
  city: string;
  hasStore: boolean;
  address: string;
  shipsNationwide: boolean;
  description: string;
}

function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      current.push(field);
      field = "";
    } else if (char === '\n') {
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || current.length) {
    current.push(field);
    rows.push(current);
  }
  if (!rows.length) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1)
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = (row[index] || "").trim();
      return record;
    }, {}));
}

function normalizeKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function getField(row: Record<string, string>, ...keys: string[]): string {
  const values = Object.keys(row).reduce<Record<string, string>>((result, key) => {
    result[normalizeKey(key)] = row[key];
    return result;
  }, {});
  for (const key of keys) {
    const value = values[normalizeKey(key)];
    if (value !== undefined) return value;
  }
  return "";
}

function mapRows(rows: Record<string, string>[]): Brand[] {
  const fallbackLogo =
    "https://images.pexels.com/photos/994523/pexels-photo-994523.jpeg?auto=compress&cs=tinysrgb&w=900";

  return rows.map((row, index) => {
    const scope = normalizeKey(getField(row, "Alcance_Envios", "Alcance Envios"));
    return {
      id: index + 1,
      name: getField(row, "Marca"),
      logo: getField(row, "Logo_URL", "Logo URL", "Imagen") || fallbackLogo,
      instagram: getField(row, "Instagram_URL", "Instagram URL", "Instagram", "URL"),
      province: getField(row, "Provincia"),
      city: getField(row, "Ciudad"),
      hasStore: normalizeKey(getField(row, "Tiene_Local", "Tiene Local")) === "si",
      address: getField(row, "Direccion", "Dirección"),
      shipsNationwide: scope.includes("nacional") || scope.includes("todo el pais"),
      description: getField(row, "Descripcion", "Descripción"),
    };
  }).filter((brand) => brand.name);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  try {
    const { data: cached } = await supabase
      .from(CACHE_TABLE)
      .select("data, fetched_at")
      .eq("cache_key", CACHE_KEY)
      .maybeSingle();
    if (cached?.fetched_at) {
      const age = (Date.now() - new Date(cached.fetched_at).getTime()) / 1000;
      if (age < CACHE_TTL_SECONDS) {
        return new Response(JSON.stringify({ brands: cached.data, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const response = await fetch(BRANDS_CSV_URL, { headers: { Accept: "text/csv" } });
    if (!response.ok) {
      if (cached) {
        return new Response(JSON.stringify({ brands: cached.data, cached: true, stale: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Failed to fetch brands sheet" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const brands = mapRows(parseCSV(await response.text()));
    await supabase.from(CACHE_TABLE).upsert({
      cache_key: CACHE_KEY,
      data: brands,
      fetched_at: new Date().toISOString(),
    }, { onConflict: "cache_key" });

    return new Response(JSON.stringify({ brands, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal server error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

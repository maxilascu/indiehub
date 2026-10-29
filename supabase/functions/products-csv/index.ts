import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SHEETS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR97zMe92tmYcr1A_KfEVQoxgUID3CBIVPzPknJ3DCIUO3Ov0BxYBza_pPPCqzDNHuNM0BtwCV6bPkl/pub?output=csv";

const CACHE_TTL_SECONDS = 60;
const CACHE_TABLE = "csv_cache";
const CACHE_KEY = "products";

interface RawRow {
  [key: string]: string;
}

interface Product {
  id: number;
  brand: string;
  name: string;
  price: number;
  image: string;
  link: string;
  gender: string;
  category: string;
  style: string;
  promotion: string;
  previousPrice: number | null;
  images: string[];
  description: string;
}

function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (char === "\r") {
      i++;
      continue;
    }

    if (char === ",") {
      current.push(field);
      field = "";
      i++;
      continue;
    }

    if (char === "\n") {
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
      i++;
      continue;
    }

    field += char;
    i++;
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  const result: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0].trim() === "") continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (row[c] || "").trim();
    }
    result.push(obj);
  }

  return result;
}

function normalizeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getField(
  row: Record<string, string>,
  ...keys: string[]
): string {
  const normalized = Object.keys(row).reduce<Record<string, string>>((acc, k) => {
    acc[normalizeKey(k)] = row[k];
    return acc;
  }, {});
  for (const key of keys) {
    const nk = normalizeKey(key);
    if (normalized[nk] !== undefined) return normalized[nk];
  }
  return "";
}

function mapRows(rows: Record<string, string>[]): Product[] {
  const FALLBACK_IMAGE =
    "https://images.pexels.com/photos/8146450/pexels-photo-8146450.jpeg?auto=compress&cs=tinysrgb&h=650&w=940";

  return rows
    .map((row, idx) => {
      const brand = getField(row, "Marca");
      const name = getField(row, "Nombre");
      if (!brand && !name) return null;

      const priceRaw = getField(row, "Precio") || "0";
      const price = parseInt(priceRaw.replace(/[^\d]/g, ""), 10) || 0;

      const image = getField(row, "Imagen", "Imagen_URL") || FALLBACK_IMAGE;
      const extraImages = [
        getField(row, "Imagen_2", "Imagen 2"),
        getField(row, "Imagen_3", "Imagen 3"),
        getField(row, "Imagen_4", "Imagen 4"),
      ].filter((url) => url !== "");
      const description = getField(row, "Descripcion", "Descripción");
      const link = getField(row, "URL", "Link_Tienda") || "#";
      const gender = getField(row, "Genero", "Género") || "Unisex";
      const category = getField(row, "Prenda");
      const style = getField(row, "Estilo");
      const location = getField(row, "Ubicacion", "Ubicación");
      const promotion = getField(row, "Promocion", "Promoción");
      const previousPriceRaw = getField(
        row,
        "Precio Anterior",
        "Precio_Anterior",
        "PrecioAnterior",
        "Precio Original",
        "PrecioOriginal"
      );
      const previousPrice = previousPriceRaw
        ? parseInt(previousPriceRaw.replace(/[^\d]/g, ""), 10) || null
        : null;

      return {
        id: idx + 1,
        brand,
        name,
        price,
        image,
        images: [image, ...extraImages],
        description,
        link,
        gender: gender || "Unisex",
        category,
        style,
        location,
        promotion: promotion.trim(),
        previousPrice,
      } as Product;
    })
    .filter((p): p is Product => p !== null);
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

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

    const now = Date.now();
    if (cached && cached.fetched_at) {
      const age = (now - new Date(cached.fetched_at).getTime()) / 1000;
      if (age < CACHE_TTL_SECONDS) {
        return new Response(
          JSON.stringify({ products: cached.data, cached: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const response = await fetch(SHEETS_CSV_URL, {
      headers: { "Accept": "text/csv" },
    });

    if (!response.ok) {
      if (cached) {
        return new Response(
          JSON.stringify({ products: cached.data, cached: true, stale: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Failed to fetch Google Sheet" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const csvText = await response.text();
    const rows = parseCSV(csvText);
    const products = mapRows(rows);

    await supabase
      .from(CACHE_TABLE)
      .upsert(
        {
          cache_key: CACHE_KEY,
          data: products,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "cache_key" }
      );

    return new Response(
      JSON.stringify({ products, cached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

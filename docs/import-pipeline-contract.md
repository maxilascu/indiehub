# Contrato del pipeline de importación

Este documento describe cómo se crean, procesan y cierran las importaciones de productos de IndieHub. Es el contrato entre la aplicación web, la base de datos y el procesador local.

## Principios

- La aplicación web (admin) solo crea importaciones y sube archivos originales. No procesa nada.
- El procesador local es un programa independiente (Python, fuera de React). Usa un usuario con rol `processor`, nunca la clave `service_role` en el frontend.
- El procesador NUNCA escribe en `products`, `brands` ni `product_images`. Solo escribe en `import_jobs`, `import_items`, `import_assets` y en el bucket `indiehub-imports`, mediante funciones RPC.
- Toda acción relevante queda registrada en `audit_log`.
- Ningún paso usa IA externa, APIs de pago, OCR, visión ni extracción de PDF en esta etapa.

## Ciclo de vida del job

```
pending ──(admin sube archivo y confirma)──> queued
website/api ──(creación)──────────────────> queued
queued ──(processor_claim_import_job)─────> claimed
claimed ──(primer progreso)───────────────> processing
processing ──(processor_submit + finish)──> needs_review | completed | failed
needs_review ──(aprobación admin, fase futura)──> approved ──> applying ──> completed
cualquiera abierto ──(cancelación admin, fase futura)──> cancelled
```

- Un job con `claimed` o `processing` cuyo `locked_at` tiene más de 10 minutos se considera abandonado y puede volver a reclamarse.
- Máximo 3 intentos (`attempt_count`). Al superarlo, el job pasa a `failed`.
- Los estados heredados (`parsing`, `extracted`, `reviewing`, `published`) se conservan solo para lectura.

## Funciones RPC

| Función | Quién la llama | Entrada | Salida |
|---|---|---|---|
| `admin_create_import_job` | admin | `p_brand_id`, `p_source_type`, `p_source_name`, `p_source_url`, `p_metadata`, `p_file_name`, `p_file_size`, `p_mime_type` | `{ "job_id", "storage_path", "status" }` |
| `admin_confirm_import_upload` | admin | `p_job_id` | `void`. Pasa el job de `pending` a `queued` tras verificar el archivo subido |
| `processor_claim_import_job` | processor | `p_worker_id`, `p_processor_version` | Payload del job o `null` si no hay trabajo |
| `processor_update_import_progress` | processor | `p_job_id`, `p_worker_id`, `p_progress` (0-100), `p_stage`, `p_metadata` | `void`. Renueva el lease |
| `processor_submit_import_results` | processor | `p_job_id`, `p_worker_id`, `p_items`, `p_assets` | `void`. Valida y guarda items y assets |
| `processor_finish_import_job` | processor | `p_job_id`, `p_worker_id`, `p_outcome` (`completed`, `needs_review`, `failed`), `p_error`, `p_metadata` | `void` |

Todas son `SECURITY DEFINER` con `search_path = public`, ejecutables solo por `authenticated`, y validan internamente el rol (`admin` o `processor`) y la propiedad del job por `p_worker_id`. El lint de Supabase que advierte sobre funciones `SECURITY DEFINER` accesibles por `authenticated` es esperado por diseño.

## Formato JSON de entrada y salida

Payload devuelto por `processor_claim_import_job`:

```json
{
  "job_id": "uuid",
  "brand_id": "uuid",
  "source_type": "pdf",
  "source_name": "Catálogo otoño 2026",
  "source_storage_path": "originals/{brand_id}/{job_id}/catalogo.pdf",
  "metadata": {},
  "attempt_count": 1
}
```

Entrada de `processor_submit_import_results`:

```json
{
  "p_items": [
    {
      "item_index": 0,
      "external_id": "ABC-123",
      "raw_data": {},
      "normalized_data": { "name": "Remera básica", "price": 12000 },
      "confidence": 0.92,
      "status": "candidate",
      "matched_product_id": null,
      "proposed_action": "create",
      "validation_errors": [],
      "warnings": []
    }
  ],
  "p_assets": [
    {
      "item_index": 0,
      "asset_type": "image",
      "storage_path": "derived/{brand_id}/{job_id}/{asset_id}.webp",
      "mime_type": "image/webp",
      "file_size": 48210,
      "sha256": "64 caracteres hexadecimales",
      "page_number": 3,
      "width": 800,
      "height": 800,
      "processing_status": "extracted"
    }
  ]
}
```

Reglas de validación del servidor:
- `confidence` debe estar entre 0 y 1.
- `matched_product_id`, si existe, debe pertenecer a la misma marca del job.
- Las rutas de assets derivados deben empezar por `derived/{brand_id}/{job_id}/` del job reclamado.
- Los items se guardan con `UNIQUE(import_job_id, item_index)`, así que reenviar resultados actualiza sin duplicar.

## Versionado

- `processor_version` es un texto (por ejemplo `local-0.1.0`) que el procesador envía al reclamar un job.
- Se guarda en `import_jobs.processor_version`, en cada `import_items` y en cada `import_assets`.
- Permite saber qué versión de lógica produjo cada resultado y reprocesar cuando cambie.

## Almacenamiento

Bucket privado `indiehub-imports` (50 MB, PDF, XLSX, XLS, CSV, ZIP, JPEG, PNG, WEBP).

- Originales: `originals/{brand_id}/{job_id}/{nombre_archivo}`. Solo el admin sube, y solo cuando el job está en `pending`.
- Derivados: `derived/{brand_id}/{job_id}/{asset_id}.webp`. Solo el procesador sube, y solo mientras reclama el job.
- Lectura: admin y processor.
- Los archivos no se sobrescriben (`upsert` deshabilitado).

## Procesador local

- Programa independiente, sin dependencia de React ni del código del sitio.
- Se autentica como usuario con rol `processor` mediante la clave pública y su sesión. Nunca usa `service_role`.
- Flujo: reclamar job, descargar original, procesar localmente, enviar progreso periódico (renueva el lease), enviar resultados, cerrar job.
- Si el procesador cae, el job se libera automáticamente tras 10 minutos sin progreso.

## Compatibilidad local a nube

```
[Procesador local]  --- RPC autenticada (processor) --->  [Supabase: funciones + tablas + bucket]
     |                                                         ^
     | lee originales, escribe derivados                       |
     +---------------------------------------------------------+
                                                               |
[Admin web /admin/importaciones] --- RPC autenticada (admin) ---+
```

El mismo contrato sirve si el procesador pasa a correr en un servidor: solo cambia dónde se ejecuta, no las funciones RPC ni el formato de datos.

## Fuera de alcance en esta etapa

- Procesamiento real de archivos (PDF, Excel, imágenes).
- Aprobación de items y aplicación a `products`.
- Creación del usuario `processor` (pendiente de provisión).

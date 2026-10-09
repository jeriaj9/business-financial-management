// Turns Supabase/PostgREST/Auth errors into messages a business owner can act on.
// RPCs already raise Spanish messages; this maps the remaining technical ones.

type MaybeError = { message?: string; code?: string; details?: string; hint?: string } | null | undefined;

const KNOWN: { test: RegExp; message: string }[] = [
  { test: /Invalid login credentials/i, message: "Correo o contraseña incorrectos." },
  { test: /Email not confirmed/i, message: "Confirma tu correo electrónico antes de iniciar sesión." },
  { test: /User already registered/i, message: "Ya existe una cuenta con este correo. Inicia sesión." },
  { test: /Password should be at least/i, message: "La contraseña debe tener al menos 6 caracteres." },
  { test: /rate limit/i, message: "Demasiados intentos. Espera un momento y vuelve a intentarlo." },
  { test: /duplicate key value.*products_company_sku_key/i, message: "Ya existe un producto con ese SKU." },
  { test: /duplicate key value.*(suppliers|sales_channels).*name/i, message: "Ya existe un registro con ese nombre." },
  { test: /duplicate key/i, message: "Ya existe un registro con esos datos." },
  { test: /violates foreign key constraint/i, message: "No se puede eliminar porque está siendo usado en otros registros. Puedes desactivarlo en su lugar." },
  { test: /row-level security|permission denied/i, message: "No tienes permisos para esta acción." },
  { test: /JWT expired|invalid JWT/i, message: "Tu sesión expiró. Vuelve a iniciar sesión." },
  { test: /Failed to fetch|NetworkError|fetch failed/i, message: "No pudimos conectar con el servidor. Revisa tu conexión." },
];

export function friendlyError(error: unknown, fallback = "Ocurrió un error inesperado. Inténtalo de nuevo."): string {
  if (!error) return fallback;
  const e = error as MaybeError & Error;
  const message = e.message ?? String(error);
  for (const known of KNOWN) {
    if (known.test.test(message)) return known.message;
  }
  // Messages raised by our own RPCs are already written for users (Spanish, no SQL details)
  if (e.code === "P0001" || e.code === "42501" || e.code === "28000" || e.code === "P0002") return message;
  if (/^[A-ZÁÉÍÓÚÑ¿¡]/.test(message) && !/relation|column|function|syntax|violates/i.test(message)) return message;
  return fallback;
}

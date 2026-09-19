import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL || ""
)
  .trim()
  .replace(/\/+$/, "");

const publishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ""
).trim();

function validateConfiguration() {
  if (
    !supabaseUrl ||
    supabaseUrl === "https://your_project_id.supabase.co"
  ) {
    throw new Error(
      "Set VITE_SUPABASE_URL in frontend/.env, then restart Vite.",
    );
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error(
      "VITE_SUPABASE_URL must be a valid Supabase project URL.",
    );
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash ||
    parsedUrl.pathname !== "/"
  ) {
    throw new Error(
      "VITE_SUPABASE_URL must be an HTTPS project origin without an extra path.",
    );
  }

  if (
    !publishableKey ||
    publishableKey === "your_supabase_publishable_key_here"
  ) {
    throw new Error(
      "Set VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env, then restart Vite.",
    );
  }

  // This project uses Supabase's publishable key format.
  // Reject secret keys and other key types in the browser configuration.
  if (!publishableKey.startsWith("sb_publishable_")) {
    throw new Error(
      "Use the Supabase publishable key beginning with sb_publishable_. " +
      "Never use a secret or service-role key in the frontend.",
    );
  }
}

validateConfiguration();

export const supabase = createClient(
  supabaseUrl,
  publishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  },
);
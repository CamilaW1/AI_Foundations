import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AUTH_CONFIG } from "./auth-config.js";

const button = document.getElementById("accountButton");
if (!button) throw new Error("Account button missing");

const configured = Boolean(AUTH_CONFIG.supabaseUrl && AUTH_CONFIG.supabaseAnonKey);

if (!configured) {
    button.textContent = "Sign in";
} else {
    const supabase = createClient(AUTH_CONFIG.supabaseUrl, AUTH_CONFIG.supabaseAnonKey);

    const paint = async () => {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;

        if (!user) {
            button.textContent = "Sign in";
            button.classList.remove("signed-in");
            return;
        }

        const name =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            "Account";

        button.textContent = "👤 " + name;
        button.classList.add("signed-in");
    };

    paint();
    supabase.auth.onAuthStateChange(() => paint());
}

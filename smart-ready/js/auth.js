import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AUTH_CONFIG } from "./auth-config.js";

const configured = Boolean(AUTH_CONFIG.supabaseUrl && AUTH_CONFIG.supabaseAnonKey);
const supabase = configured
    ? createClient(AUTH_CONFIG.supabaseUrl, AUTH_CONFIG.supabaseAnonKey, {
        auth: {
            flowType: "pkce",
            detectSessionInUrl: false,
            persistSession: true,
            autoRefreshToken: true
        }
    })
    : null;

const isNative = Boolean(window.Capacitor?.isNativePlatform?.());
const nativePlugins = window.Capacitor?.Plugins || {};
const Browser = nativePlugins.Browser;
const App = nativePlugins.App;

const elements = {
    status: document.getElementById("authStatus"),
    signedOut: document.getElementById("signedOutView"),
    signedIn: document.getElementById("signedInView"),
    forgot: document.getElementById("forgotView"),
    newPassword: document.getElementById("newPasswordView"),
    signInTab: document.getElementById("signInTab"),
    signUpTab: document.getElementById("signUpTab"),
    form: document.getElementById("authForm"),
    email: document.getElementById("emailInput"),
    password: document.getElementById("passwordInput"),
    confirmField: document.getElementById("confirmPasswordField"),
    confirm: document.getElementById("confirmPasswordInput"),
    passwordRules: document.getElementById("passwordRules"),
    submit: document.getElementById("submitAuthButton"),
    forgotButton: document.getElementById("forgotPasswordButton"),
    resetEmail: document.getElementById("resetEmailInput"),
    sendReset: document.getElementById("sendResetButton"),
    backSignIn: document.getElementById("backToSignIn"),
    newPassword: document.getElementById("newPasswordInput"),
    newPasswordConfirm: document.getElementById("newPasswordConfirmInput"),
    newPasswordRules: document.getElementById("newPasswordRules"),
    saveNewPassword: document.getElementById("saveNewPasswordButton"),
    signOut: document.getElementById("signOutButton"),
    message: document.getElementById("authMessage"),
    profileInitial: document.getElementById("profileInitial"),
    profileTitle: document.getElementById("profileTitle"),
    profileEmail: document.getElementById("profileEmail"),
    guest: document.getElementById("continueGuest")
};

let mode = "signin";

function setStatus() {
    if (configured) {
        elements.status.className = "auth-service-status ready";
        elements.status.innerHTML = "<span>●</span><div><strong>Account service ready</strong><small>Email/password and enabled social providers can be used.</small></div>";
        return;
    }

    elements.status.className = "auth-service-status setup";
    elements.status.innerHTML = "<span>●</span><div><strong>Account connection is being configured</strong><small>The UI is ready, but the Supabase project keys still need to be connected.</small></div>";
}

function showOnly(view) {
    elements.signedOut.classList.toggle("hidden", view !== "signedOut");
    elements.signedIn.classList.toggle("hidden", view !== "signedIn");
    elements.forgot.classList.toggle("hidden", view !== "forgot");
    elements.newPassword.classList.toggle("hidden", view !== "newPassword");
}

function switchMode(nextMode) {
    mode = nextMode;
    const signup = mode === "signup";

    elements.signInTab.classList.toggle("active", !signup);
    elements.signUpTab.classList.toggle("active", signup);
    elements.confirmField.classList.toggle("hidden", !signup);
    elements.passwordRules.classList.toggle("hidden", !signup);
    elements.forgotButton.classList.toggle("hidden", signup);
    elements.submit.textContent = signup ? "Create account" : "Sign in";
    elements.password.autocomplete = signup ? "new-password" : "current-password";
    hideMessage();
}

function passwordChecks(password) {
    return {
        length: password.length >= 8,
        upper: /[A-Z]/.test(password),
        lower: /[a-z]/.test(password),
        number: /\d/.test(password)
    };
}

function passwordValid(password) {
    return Object.values(passwordChecks(password)).every(Boolean);
}

function paintRules(container, password) {
    const checks = passwordChecks(password);

    Object.entries(checks).forEach(([name, passed]) => {
        const row = container.querySelector('[data-rule="' + name + '"]');
        if (!row) return;

        row.classList.toggle("pass", passed);
        row.textContent = (passed ? "✓ " : "○ ") + row.textContent.replace(/^[✓○]\s*/, "");
    });
}

function showMessage(text, type = "info") {
    elements.message.className = "auth-message " + type;
    elements.message.textContent = text;
}

function hideMessage() {
    elements.message.className = "auth-message hidden";
    elements.message.textContent = "";
}

function requireConfigured() {
    if (configured) return true;

    showMessage("Authentication needs the Supabase project connection before real accounts can be created.", "warning");
    return false;
}

async function handleEmailAuth(event) {
    event.preventDefault();
    hideMessage();

    if (!requireConfigured()) return;

    const email = elements.email.value.trim();
    const password = elements.password.value;

    if (!email || !password) {
        showMessage("Enter both your email and password.", "warning");
        return;
    }

    elements.submit.disabled = true;
    elements.submit.textContent = mode === "signup" ? "Creating account…" : "Signing in…";

    try {
        if (mode === "signup") {
            if (!passwordValid(password)) {
                showMessage("Use a stronger password that meets all four rules.", "warning");
                return;
            }

            if (password !== elements.confirm.value) {
                showMessage("The two passwords do not match.", "warning");
                return;
            }

            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: AUTH_CONFIG.webAuthUrl + "?mode=verified"
                }
            });

            if (error) throw error;

            if (data.session) {
                await showSession(data.session);
            } else {
                showMessage("Account created. Check your email to verify the address, then sign in.", "success");
            }
        } else {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            await showSession(data.session);
        }
    } catch (error) {
        showMessage(friendlyError(error), "error");
    } finally {
        elements.submit.disabled = false;
        elements.submit.textContent = mode === "signup" ? "Create account" : "Sign in";
    }
}

async function socialSignIn(provider) {
    hideMessage();
    if (!requireConfigured()) return;

    try {
        const redirectTo = isNative
            ? AUTH_CONFIG.nativeRedirectUrl
            : AUTH_CONFIG.webAuthUrl;

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo,
                skipBrowserRedirect: isNative
            }
        });

        if (error) throw error;

        if (isNative && data?.url) {
            if (Browser?.open) {
                await Browser.open({ url: data.url });
            } else {
                location.href = data.url;
            }
        }
    } catch (error) {
        showMessage(friendlyError(error), "error");
    }
}

async function sendReset() {
    hideMessage();
    if (!requireConfigured()) return;

    const email = elements.resetEmail.value.trim();

    if (!email) {
        showMessage("Enter the email address for your account.", "warning");
        return;
    }

    elements.sendReset.disabled = true;
    elements.sendReset.textContent = "Sending…";

    try {
        const redirectTo = AUTH_CONFIG.webAuthUrl + "?mode=reset";
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;

        showMessage("Password reset email sent. Open the link in that email to create a new password.", "success");
    } catch (error) {
        showMessage(friendlyError(error), "error");
    } finally {
        elements.sendReset.disabled = false;
        elements.sendReset.textContent = "Send reset link";
    }
}

async function saveNewPassword() {
    hideMessage();
    if (!requireConfigured()) return;

    const password = elements.newPassword.value;

    if (!passwordValid(password)) {
        showMessage("Use a stronger password that meets all four rules.", "warning");
        return;
    }

    if (password !== elements.newPasswordConfirm.value) {
        showMessage("The two passwords do not match.", "warning");
        return;
    }

    elements.saveNewPassword.disabled = true;
    elements.saveNewPassword.textContent = "Saving…";

    try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;

        showMessage("Your new password has been saved.", "success");
        setTimeout(() => showCurrentSession(), 700);
    } catch (error) {
        showMessage(friendlyError(error), "error");
    } finally {
        elements.saveNewPassword.disabled = false;
        elements.saveNewPassword.textContent = "Save new password";
    }
}

async function exchangeCode(urlString) {
    if (!configured) return false;

    try {
        const url = new URL(urlString);
        const code = url.searchParams.get("code");
        if (!code) return false;

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;

        await Browser?.close?.();

        const resetMode =
            url.searchParams.get("mode") === "reset" ||
            new URLSearchParams(location.search).get("mode") === "reset";

        if (resetMode) {
            showOnly("newPassword");
        } else {
            await showSession(data.session);
        }

        return true;
    } catch (error) {
        showMessage(friendlyError(error), "error");
        return false;
    }
}

async function showCurrentSession() {
    if (!configured) {
        showOnly("signedOut");
        return;
    }

    const { data } = await supabase.auth.getSession();
    if (data.session) {
        await showSession(data.session);
    } else {
        showOnly("signedOut");
    }
}

async function showSession(session) {
    if (!session?.user) {
        showOnly("signedOut");
        return;
    }

    const user = session.user;
    const email = user.email || "";
    const name =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        email.split("@")[0] ||
        "AI Builder user";

    elements.profileTitle.textContent = "Welcome, " + name;
    elements.profileEmail.textContent = email;
    elements.profileInitial.textContent = name.slice(0, 2).toUpperCase();

    showOnly("signedIn");
}

function friendlyError(error) {
    const message = String(error?.message || "Authentication failed.");

    if (/invalid login credentials/i.test(message)) return "Email or password is incorrect.";
    if (/user already registered/i.test(message)) return "An account with this email already exists.";
    if (/email not confirmed/i.test(message)) return "Verify your email before signing in.";
    if (/provider is not enabled/i.test(message)) return "This social sign-in provider has not been enabled yet.";

    return message;
}

function wirePasswordToggle(buttonId, inputId) {
    const button = document.getElementById(buttonId);
    const input = document.getElementById(inputId);

    button?.addEventListener("click", () => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.textContent = show ? "Hide" : "Show";
    });
}

async function initialize() {
    setStatus();

    elements.signInTab.addEventListener("click", () => switchMode("signin"));
    elements.signUpTab.addEventListener("click", () => switchMode("signup"));
    elements.form.addEventListener("submit", handleEmailAuth);

    document.querySelectorAll("[data-provider]").forEach(button => {
        button.addEventListener("click", () => socialSignIn(button.dataset.provider));
    });

    elements.password.addEventListener("input", () => paintRules(elements.passwordRules, elements.password.value));
    elements.newPassword.addEventListener("input", () => paintRules(elements.newPasswordRules, elements.newPassword.value));

    elements.forgotButton.addEventListener("click", () => {
        elements.resetEmail.value = elements.email.value.trim();
        showOnly("forgot");
        hideMessage();
    });

    elements.backSignIn.addEventListener("click", () => {
        showOnly("signedOut");
        switchMode("signin");
    });

    elements.sendReset.addEventListener("click", sendReset);
    elements.saveNewPassword.addEventListener("click", saveNewPassword);

    elements.guest.addEventListener("click", () => {
        location.href = "index.html";
    });

    elements.signOut.addEventListener("click", async () => {
        if (supabase) await supabase.auth.signOut();
        showOnly("signedOut");
        switchMode("signin");
        showMessage("Signed out.", "success");
    });

    wirePasswordToggle("togglePassword", "passwordInput");
    wirePasswordToggle("toggleConfirmPassword", "confirmPasswordInput");
    wirePasswordToggle("toggleNewPassword", "newPasswordInput");

    if (configured && App?.addListener) {
        await App.addListener("appUrlOpen", async event => {
            if (event?.url?.startsWith(AUTH_CONFIG.nativeRedirectUrl)) {
                await exchangeCode(event.url);
            }
        });
    }

    const currentUrl = new URL(location.href);
    const hasCode = currentUrl.searchParams.has("code");

    if (hasCode) {
        const exchanged = await exchangeCode(location.href);
        if (exchanged) return;
    }

    if (currentUrl.searchParams.get("mode") === "reset") {
        showOnly("newPassword");
        return;
    }

    await showCurrentSession();
}

initialize();

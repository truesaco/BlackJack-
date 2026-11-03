// Sign-in with Google or email/password, backed by Supabase Auth.
(() => {
  "use strict";

  // The publishable key is designed to be public; access is enforced by Supabase.
  const SUPABASE_URL = "https://ahftbaykwpegkcpftiam.supabase.co";
  const SUPABASE_KEY = "sb_publishable_xC7vKxnh2oRdsid6syIc4A_JcpT42L-";

  const $ = (id) => document.getElementById(id);
  const el = {
    auth: $("auth"),
    app: $("app"),
    loading: $("loading"),
    sub: $("auth-sub"),
    google: $("google-signin"),
    form: $("email-form"),
    email: $("email"),
    password: $("password"),
    submit: $("email-submit"),
    error: $("auth-error"),
    info: $("auth-info"),
    switchText: $("switch-text"),
    switchMode: $("switch-mode"),
    forgot: $("forgot"),
    userEmail: $("user-email"),
    signout: $("signout"),
  };

  // Where Supabase sends people back after Google sign-in or an email link.
  const REDIRECT_URL = window.location.origin + window.location.pathname;

  if (!window.supabase || !window.supabase.createClient) {
    el.loading.textContent = "Couldn't load the sign-in service. Check your connection and refresh.";
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // mode: "signin" | "signup" | "forgot" | "recovery"
  let mode = "signin";
  let currentUserId;

  function setMode(next) {
    mode = next;
    clearNotices();
    const passwordShown = mode !== "forgot";
    el.password.hidden = !passwordShown;
    el.form.querySelector('label[for="password"]').hidden = !passwordShown;
    el.email.hidden = mode === "recovery";
    el.form.querySelector('label[for="email"]').hidden = mode === "recovery";
    el.google.hidden = mode === "recovery";
    el.form.previousElementSibling.hidden = mode === "recovery"; // the "or" divider

    const copy = {
      signin:   { sub: "Sign in to take a seat at the table.", btn: "Sign in",        q: "New here?",               link: "Create an account" },
      signup:   { sub: "Create an account to start playing.",  btn: "Create account", q: "Already have an account?", link: "Sign in" },
      forgot:   { sub: "We'll email you a link to reset your password.", btn: "Send reset link", q: "Remembered it?", link: "Back to sign in" },
      recovery: { sub: "Choose a new password.",                btn: "Update password", q: "",                       link: "Back to sign in" },
    }[mode];
    el.sub.textContent = copy.sub;
    el.submit.textContent = copy.btn;
    el.switchText.textContent = copy.q;
    el.switchMode.textContent = copy.link;
    el.forgot.hidden = mode !== "signin";
    el.password.autocomplete = mode === "signin" ? "current-password" : "new-password";
  }

  function clearNotices() {
    el.error.textContent = "";
    el.info.textContent = "";
  }

  function setBusy(busy) {
    el.submit.disabled = busy;
    el.google.disabled = busy;
  }

  function friendlyError(err) {
    const msg = (err && err.message) || "Something went wrong. Please try again.";
    if (/invalid login credentials/i.test(msg)) return "Incorrect email or password.";
    if (/email not confirmed/i.test(msg)) return "Please confirm your email first — check your inbox for the link.";
    if (/provider is not enabled/i.test(msg)) return "Google sign-in isn't enabled yet for this site.";
    return msg;
  }

  // ---------- Views ----------
  function showSignedIn(user) {
    el.loading.classList.add("hidden");
    el.auth.classList.add("hidden");
    el.app.classList.remove("hidden");
    const name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || user.email;
    el.userEmail.textContent = name || "";
    el.userEmail.title = user.email || "";
    if (currentUserId !== user.id) {
      currentUserId = user.id;
      if (window.blackjackSetPlayer) window.blackjackSetPlayer(user.id);
    }
  }

  function showSignedOut() {
    currentUserId = undefined;
    el.loading.classList.add("hidden");
    el.app.classList.add("hidden");
    el.auth.classList.remove("hidden");
    el.password.value = "";
    if (mode === "recovery") setMode("signin");
  }

  // ---------- Actions ----------
  el.google.addEventListener("click", async () => {
    clearNotices();
    setBusy(true);
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: REDIRECT_URL },
    });
    // On success the browser navigates to Google, so we only get here on error.
    if (error) {
      el.error.textContent = friendlyError(error);
      setBusy(false);
    }
  });

  el.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearNotices();
    const email = el.email.value.trim();
    const password = el.password.value;

    if (mode !== "recovery" && !/^\S+@\S+\.\S+$/.test(email)) {
      el.error.textContent = "Enter a valid email address.";
      return;
    }
    if (mode !== "forgot" && password.length < 6) {
      el.error.textContent = "Password must be at least 6 characters.";
      return;
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: REDIRECT_URL },
        });
        if (error) throw error;
        if (!data.session) {
          // Email confirmation is on: user must click the link first.
          setMode("signin");
          el.email.value = email;
          el.info.textContent = `Check ${email} for a confirmation link, then sign in.`;
        }
      } else if (mode === "forgot") {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT_URL });
        if (error) throw error;
        el.info.textContent = `If an account exists for ${email}, a reset link is on its way.`;
      } else if (mode === "recovery") {
        const { data, error } = await sb.auth.updateUser({ password });
        if (error) throw error;
        setMode("signin");
        if (data.user) showSignedIn(data.user);
      }
    } catch (err) {
      el.error.textContent = friendlyError(err);
    } finally {
      setBusy(false);
    }
  });

  el.switchMode.addEventListener("click", () => {
    setMode(mode === "signin" ? "signup" : "signin");
  });

  el.forgot.addEventListener("click", () => setMode("forgot"));

  el.signout.addEventListener("click", async () => {
    await sb.auth.signOut();
  });

  // ---------- Session ----------
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      // User arrived from a reset-password email: ask for a new password.
      el.loading.classList.add("hidden");
      el.app.classList.add("hidden");
      el.auth.classList.remove("hidden");
      setMode("recovery");
      return;
    }
    if (mode === "recovery") return;
    // Defer UI work so we don't block Supabase's internal auth lock.
    setTimeout(() => (session ? showSignedIn(session.user) : showSignedOut()), 0);
  });

  setMode("signin");
})();

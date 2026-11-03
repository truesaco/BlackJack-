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
    signout: $("signout"),
    openProfile: $("open-profile"),
    greeting: $("user-greeting"),
    headerAvatar: $("header-avatar"),
    profile: $("profile"),
    profileForm: $("profile-form"),
    profileClose: $("profile-close"),
    profileAvatar: $("profile-avatar"),
    photoInput: $("photo-input"),
    photoReset: $("photo-reset"),
    displayName: $("display-name"),
    profileEmail: $("profile-email"),
    profileMeta: $("profile-meta"),
    profileError: $("profile-error"),
    profileInfo: $("profile-info"),
    profileSave: $("profile-save"),
  };

  const AVATAR_BUCKET = "avatars";
  const AVATAR_SIZE = 256; // uploaded photos are cropped to a 256×256 square

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
  let currentUser = null;

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
    currentUser = user;
    el.loading.classList.add("hidden");
    el.auth.classList.add("hidden");
    el.app.classList.remove("hidden");

    const p = profileOf(user);
    el.greeting.textContent = `Hi, ${firstName(p.name)}`;
    el.openProfile.title = user.email || "";
    renderAvatar(el.headerAvatar, p.photo, p.name);

    if (currentUserId !== user.id) {
      currentUserId = user.id;
      const greeting = p.isNew ? `Welcome, ${firstName(p.name)}!` : `Welcome back, ${firstName(p.name)}!`;
      if (window.blackjackSetPlayer) window.blackjackSetPlayer(user.id, greeting);
    }
  }

  function showSignedOut() {
    currentUserId = undefined;
    currentUser = null;
    if (el.profile.open) el.profile.close();
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
    el.signout.disabled = true;
    await sb.auth.signOut();
    el.signout.disabled = false;
  });

  // ---------- Profile ----------
  // Google fills avatar_url / full_name on every Google sign-in. The player's own
  // choices live in separate keys (display_name, custom_avatar_url) so they are
  // never overwritten, and Google's values stay available as the defaults.
  function profileOf(user) {
    const m = user.user_metadata || {};
    const googlePhoto = m.avatar_url || m.picture || null;
    const googleName = m.full_name || m.name || null;
    const emailName = user.email ? user.email.split("@")[0] : "Player";
    const created = Date.parse(user.created_at);
    return {
      name: m.display_name || googleName || emailName,
      defaultName: googleName || emailName,
      photo: m.custom_avatar_url || googlePhoto,
      googlePhoto,
      customPhoto: m.custom_avatar_url || null,
      isNew: Number.isFinite(created) && Date.now() - created < 2 * 60 * 1000,
    };
  }

  const firstName = (name) => String(name || "Player").trim().split(/\s+/)[0];

  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/);
    return ((parts[0] || "")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
  }

  function renderAvatar(target, url, name) {
    target.replaceChildren();
    const fallback = () => { target.replaceChildren(); target.textContent = initials(name); };
    if (!url) return fallback();
    const img = document.createElement("img");
    img.alt = "";
    img.referrerPolicy = "no-referrer"; // Google profile photos refuse some referrers
    img.onerror = fallback;
    img.src = url;
    target.appendChild(img);
  }

  // Profile edits are staged here until Save is pressed.
  let draft = { file: null, previewUrl: null, resetToGoogle: false };

  function resetDraft() {
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    draft = { file: null, previewUrl: null, resetToGoogle: false };
    el.photoInput.value = "";
  }

  function renderProfileDialog() {
    const p = profileOf(currentUser);
    const photo = draft.previewUrl || (draft.resetToGoogle ? p.googlePhoto : p.photo);
    renderAvatar(el.profileAvatar, photo, el.displayName.value || p.name);

    const usingCustom = draft.file || (p.customPhoto && !draft.resetToGoogle);
    el.photoReset.textContent = !usingCustom ? "" : p.googlePhoto ? "Use Google photo" : "Remove photo";
  }

  function openProfile() {
    if (!currentUser) return;
    resetDraft();
    const p = profileOf(currentUser);
    el.displayName.value = p.name;
    el.displayName.placeholder = p.defaultName;
    el.profileEmail.value = currentUser.email || "";
    const provider = (currentUser.app_metadata && currentUser.app_metadata.provider) || "email";
    const since = new Date(currentUser.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    el.profileMeta.textContent = `Signed in with ${provider === "google" ? "Google" : "email"} · Member since ${since}`;
    el.profileError.textContent = "";
    el.profileInfo.textContent = "";
    renderProfileDialog();
    el.profile.showModal();
  }

  el.openProfile.addEventListener("click", openProfile);
  el.profileClose.addEventListener("click", () => el.profile.close());
  el.profile.addEventListener("close", resetDraft);
  // Click on the dimmed backdrop closes the dialog.
  el.profile.addEventListener("click", (e) => { if (e.target === el.profile) el.profile.close(); });
  el.displayName.addEventListener("input", renderProfileDialog);

  el.photoInput.addEventListener("change", () => {
    const file = el.photoInput.files && el.photoInput.files[0];
    el.profileError.textContent = "";
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
      el.profileError.textContent = "Please choose a PNG, JPG, WebP or GIF image.";
      el.photoInput.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      el.profileError.textContent = "That image is over 10 MB. Please pick a smaller one.";
      el.photoInput.value = "";
      return;
    }
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    draft.file = file;
    draft.previewUrl = URL.createObjectURL(file);
    draft.resetToGoogle = false;
    renderProfileDialog();
  });

  el.photoReset.addEventListener("click", () => {
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    draft.file = null;
    draft.previewUrl = null;
    draft.resetToGoogle = true;
    el.photoInput.value = "";
    renderProfileDialog();
  });

  // Crop to a centred square and shrink, so uploads are small and fast.
  function squareJpeg(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(
          img,
          (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
          0, 0, AVATAR_SIZE, AVATAR_SIZE
        );
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that image."))), "image/jpeg", 0.88);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image.")); };
      img.src = url;
    });
  }

  async function removeOldPhotos(userId, keepPath) {
    const { data } = await sb.storage.from(AVATAR_BUCKET).list(userId);
    const stale = (data || []).map((f) => `${userId}/${f.name}`).filter((path) => path !== keepPath);
    if (stale.length) await sb.storage.from(AVATAR_BUCKET).remove(stale);
  }

  el.profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    el.profileError.textContent = "";
    el.profileInfo.textContent = "";
    const user = currentUser;
    const p = profileOf(user);
    const name = el.displayName.value.trim().replace(/\s+/g, " ");
    if (!name) {
      el.profileError.textContent = "Display name can't be empty.";
      return;
    }

    el.profileSave.disabled = true;
    el.profileSave.textContent = "Saving…";
    try {
      const updates = { display_name: name === p.defaultName ? null : name };

      if (draft.file) {
        const blob = await squareJpeg(draft.file);
        const path = `${user.id}/${Date.now()}.jpg`;
        const { error: upErr } = await sb.storage
          .from(AVATAR_BUCKET)
          .upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600" });
        if (upErr) throw upErr;
        updates.custom_avatar_url = sb.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
        removeOldPhotos(user.id, path).catch(() => {});
      } else if (draft.resetToGoogle) {
        updates.custom_avatar_url = null;
        removeOldPhotos(user.id, null).catch(() => {});
      }

      const { data, error } = await sb.auth.updateUser({ data: updates });
      if (error) throw error;
      if (data && data.user) showSignedIn(data.user);
      el.profile.close();
    } catch (err) {
      el.profileError.textContent = friendlyError(err);
    } finally {
      el.profileSave.disabled = false;
      el.profileSave.textContent = "Save";
    }
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

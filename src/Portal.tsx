import { useEffect, useState, FormEvent } from "react";
import { supabase } from "./supabase";
import { rpc } from "./repository";
export default function Portal() {
  const [view, setView] = useState<any>(null),
    [signed, setSigned] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [phone, setPhone] = useState(""),
    [location, setLocation] = useState(""),
    [consent, setConsent] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [setup, setSetup] = useState(
      new URLSearchParams(locationSearch()).get("setup") === "1",
    );
  const load = async () => {
    const r = await rpc("candidate_portal", {});
    setView(r);
    setPhone(r.candidate.phone);
    setLocation(r.candidate.location);
    setConsent(r.consent);
  };
  useEffect(() => {
    if (!supabase) {
      setMessage("Configurá Supabase para activar el portal.");
      return;
    }
    let alive = true;
    const check = async () => {
      const {
        data: { session },
      } = await supabase!.auth.getSession();
      if (!alive) return;
      setSigned(!!session);
      if (session)
        try {
          await load();
        } catch (e: any) {
          setMessage(e.message);
        }
    };
    void check();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setSetup(true);
      setTimeout(() => {
        if (alive) void check();
      }, 0);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  const login = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      if (!supabase) throw new Error("Supabase no está configurado.");
      const r = await supabase.auth.signInWithPassword({ email, password });
      if (r.error) throw r.error;
      setSigned(true);
      await load();
    });
  };
  return (
    <div className="portal-page">
      <section className="panel settings-card">
        <div className="wordmark">
          NEXO<span>PORTAL DE CANDIDATOS</span>
        </div>
        <h1>
          {view ? "Hola, " + view.candidate.name : "Tu espacio de candidato"}
        </h1>
        {message && (
          <div role="status" className="error">
            {message}
          </div>
        )}
        {!signed ? (
          <form onSubmit={login}>
            <label>
              Email
              <input
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Contraseña
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button disabled={busy} className="primary">
              Ingresar
            </button>
            <button
              type="button"
              disabled={busy || !email}
              className="text-btn"
              onClick={() =>
                void act(async () => {
                  if (!supabase)
                    throw new Error("Supabase no está configurado");
                  const r = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + "/?portal=1&setup=1",
                  });
                  if (r.error) throw r.error;
                  setMessage(
                    "Si la cuenta existe, recibirás un enlace para recuperar el acceso.",
                  );
                })
              }
            >
              Recuperar contraseña
            </button>
            <p>Acceso por invitación. Pedí tu acceso a la selectora.</p>
          </form>
        ) : (
          <>
            {setup && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    if (password.length < 10)
                      throw new Error("Usá al menos 10 caracteres");
                    const r = await supabase!.auth.updateUser({ password });
                    if (r.error) throw r.error;
                    setSetup(false);
                    setPassword("");
                    window.history.replaceState({}, "", "/?portal=1");
                    setMessage("Contraseña actualizada.");
                  });
                }}
              >
                <label>
                  Elegí una contraseña
                  <input
                    required
                    type="password"
                    minLength={10}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                <button disabled={busy} className="primary">
                  Guardar contraseña
                </button>
              </form>
            )}
            {view && (
              <>
                <h2>Mis datos de contacto</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () => {
                      await rpc("update_candidate_contact", {
                        p_phone: phone,
                        p_location: location,
                        p_consent: consent,
                      });
                      await load();
                      setMessage("Datos actualizados.");
                    });
                  }}
                >
                  <label>
                    Teléfono
                    <input
                      maxLength={50}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </label>
                  <label>
                    Localidad
                    <input
                      maxLength={200}
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      required
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    Confirmo que son mis datos y autorizo actualizar mi ficha
                    para estos procesos de selección.
                  </label>
                  <button disabled={busy} className="primary">
                    Actualizar contacto
                  </button>
                </form>
                <h2>Mis procesos</h2>
                {view.processes.map((p: any) => (
                  <div className="interview-card" key={p.id}>
                    <strong>{p.title}</strong>
                    <p>{p.status}</p>
                  </div>
                ))}
                {!view.processes.length && <p>No hay procesos asociados.</p>}
                <h2>Mis CV</h2>
                {view.documents.map((d: any) => (
                  <p key={d.id}>
                    <button
                      disabled={busy}
                      className="secondary"
                      onClick={() =>
                        void act(async () => {
                          const r = await supabase!.storage
                            .from("nexo-cv")
                            .download(d.path);
                          if (r.error) throw r.error;
                          const url = URL.createObjectURL(r.data),
                            a = document.createElement("a");
                          a.href = url;
                          a.download = d.filename;
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 10000);
                        })
                      }
                    >
                      {d.filename}
                    </button>
                  </p>
                ))}
              </>
            )}
            <button
              disabled={busy}
              className="secondary"
              onClick={() =>
                void act(async () => {
                  await supabase!.auth.signOut();
                  setSigned(false);
                  setView(null);
                })
              }
            >
              Cerrar sesión
            </button>
          </>
        )}
      </section>
      <p>
        <a href="/">Portal de empresas</a>
      </p>
    </div>
  );
}
function locationSearch() {
  return window.location.search;
}

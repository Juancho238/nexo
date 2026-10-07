import { useEffect, useState, FormEvent } from "react";
import { Candidate, Data, Profile, uid } from "./model";
import { supabase } from "./supabase";
import { rpc } from "./repository";
const when = (s: string) => new Date(s).toLocaleString("es-AR");
const store = (key: string) => JSON.parse(sessionStorage.getItem(key) || "[]");
const persist = (key: string, rows: any[]) =>
  sessionStorage.setItem(key, JSON.stringify(rows));
export function CandidateTools({
  candidate: c,
  data,
  user,
  demo,
  onEdit,
}: {
  candidate: Candidate;
  data: Data;
  user: Profile;
  demo: boolean;
  onEdit: () => void;
}) {
  const [docs, setDocs] = useState<any[]>([]),
    [feedback, setFeedback] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [application, setApplication] = useState(""),
    [text, setText] = useState(""),
    [recommendation, setRecommendation] = useState("Aprobar"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [location, setLocation] = useState(""),
    [cvText, setCvText] = useState("");
  const apps = data.applications.filter((a) => a.candidate_id === c.id),
    admin = user.role === "super_admin";
  const load = async (isCurrent: () => boolean = () => true) => {
    if (demo) {
      setDocs([]);
      setFeedback(
        store("nexo-feedback").filter((f: any) =>
          apps.some((a) => a.id === f.application_id),
        ),
      );
      return;
    }
    const [d, f] = await Promise.all([
      supabase!
        .from("candidate_documents")
        .select("*")
        .eq("candidate_id", c.id)
        .order("created_at", { ascending: false }),
      supabase!
        .from("manager_feedback")
        .select("*")
        .in(
          "application_id",
          apps.map((a) => a.id),
        )
        .order("created_at", { ascending: false }),
    ]);
    if (d.error) throw d.error;
    if (f.error) throw f.error;
    if (isCurrent()) {
      setDocs(d.data);
      setFeedback(f.data);
    }
  };
  useEffect(() => {
    let current = true;
    void load(() => current).catch((e) => {
      if (current) setError(e.message);
    });
    return () => {
      current = false;
    };
  }, [c.id, demo, data.applications]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File) => {
    if (demo)
      throw new Error(
        "La carga privada requiere Supabase. No se guardan archivos en la demostración.",
      );
    if (file.size > 5242880 || file.size === 0)
      throw new Error("Elegí un PDF de hasta 5 MB.");
    if (
      new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== "%PDF-"
    )
      throw new Error("El archivo no es un PDF válido.");
    const path = `${c.id}/${uid()}.pdf`;
    const { error } = await supabase!.storage
      .from("nexo-cv")
      .upload(path, file, { contentType: "application/pdf", upsert: false });
    if (error) throw error;
    const saved = await supabase!.from("candidate_documents").insert({
      candidate_id: c.id,
      path,
      filename: file.name,
      mime: "application/pdf",
      size_bytes: file.size,
      created_by: user.id,
    });
    if (saved.error) {
      await supabase!.storage.from("nexo-cv").remove([path]);
      throw saved.error;
    }
  };
  const chosen = apps.find((a) => a.id === application),
    canFeedback =
      chosen &&
      ["Presentado a gerencia", "Entrevista gerencial"].includes(
        chosen.stage,
      ) &&
      ["super_admin", "gerente", "admin_cliente"].includes(user.role);
  return (
    <section className="v2-tools">
      <div className="panel-heading">
        <h3>Documentos y coordinación</h3>
        {admin && (
          <button
            disabled={busy || demo || !c.email}
            className="secondary"
            onClick={() =>
              void act(async () => {
                const r = await supabase!.functions.invoke("invite-candidate", {
                  body: { candidate_id: c.id },
                });
                if (r.error) throw r.error;
                if (r.data?.error) throw new Error(r.data.error);
                setError("Invitación enviada al email de la ficha.");
              })
            }
          >
            Invitar al portal
          </button>
        )}
        {admin && (
          <button className="secondary" onClick={onEdit}>
            Editar ficha
          </button>
        )}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <p>CV privados · PDF hasta 5 MB · Acceso según permisos de la ficha.</p>
      {admin && (
        <label>
          Cargar CV
          <input
            disabled={busy}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void act(() => upload(f));
              e.target.value = "";
            }}
          />
        </label>
      )}
      {docs.map((d) => (
        <div className="timeline-row" key={d.id}>
          <span>
            {d.filename} · {Math.ceil(d.size_bytes / 1024)} KB
          </span>
          <button
            disabled={busy}
            className="secondary small"
            onClick={() =>
              void act(async () => {
                await rpc("record_read", { p_resource: "cv", p_id: c.id });
                const { data, error } = await supabase!.storage
                  .from("nexo-cv")
                  .download(d.path);
                if (error) throw error;
                const url = URL.createObjectURL(data);
                const a = document.createElement("a");
                a.href = url;
                a.download = d.filename;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
              })
            }
          >
            Descargar
          </button>
          <button
            disabled={busy}
            className="secondary small"
            onClick={() =>
              void act(async () => {
                await rpc("record_read", { p_resource: "cv", p_id: c.id });
                const r = await supabase!.storage
                  .from("nexo-cv")
                  .download(d.path);
                if (r.error) throw r.error;
                const { readPdf } = await import("./pdf");
                setCvText(await readPdf(r.data));
              })
            }
          >
            Leer texto del CV
          </button>
          {admin && (
            <button
              disabled={busy}
              className="text-btn"
              onClick={() =>
                void act(async () => {
                  const r = await supabase!.storage
                    .from("nexo-cv")
                    .remove([d.path]);
                  if (r.error) throw r.error;
                  const del = await supabase!
                    .from("candidate_documents")
                    .delete()
                    .eq("id", d.id);
                  if (del.error) throw del.error;
                })
              }
            >
              Eliminar CV
            </button>
          )}
        </div>
      ))}
      {cvText && (
        <label>
          Texto del CV (revisar antes de usar)
          <textarea readOnly value={cvText} rows={10} />
        </label>
      )}
      {!docs.length && <small>Sin CV cargados.</small>}
      {c.phone && (
        <p>
          <a
            className="secondary"
            href={`https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent("Hola " + c.name + ", te contactamos desde NEXO.")}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir WhatsApp
          </a>
          <small>
            {" "}
            Requiere teléfono con código de país. El mensaje se envía
            manualmente.
          </small>
        </p>
      )}
      {apps.length > 0 && (
        <>
          <label>
            Proceso
            <select
              value={application}
              onChange={(e) => setApplication(e.target.value)}
            >
              <option value="">Seleccionar proceso</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {data.searches.find((s) => s.id === a.search_id)?.title ||
                    "Proceso"}{" "}
                  · {a.stage}
                </option>
              ))}
            </select>
          </label>
          {admin && chosen && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  if (new Date(end) <= new Date(start))
                    throw new Error(
                      "La finalización debe ser posterior al inicio.",
                    );
                  const row = {
                    id: uid(),
                    application_id: chosen.id,
                    starts_at: new Date(start).toISOString(),
                    ends_at: new Date(end).toISOString(),
                    interviewer: user.name,
                    location,
                    notes: "",
                    status: "Programada",
                    created_by: user.id,
                  };
                  if (demo)
                    persist("nexo-agenda", [...store("nexo-agenda"), row]);
                  else {
                    const r = await supabase!.from("appointments").insert(row);
                    if (r.error) throw r.error;
                  }
                  setStart("");
                  setEnd("");
                  setError("Entrevista agendada.");
                });
              }}
            >
              <h3>Agendar entrevista</h3>
              <div className="form-grid">
                <label>
                  Inicio
                  <input
                    required
                    type="datetime-local"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  Fin
                  <input
                    required
                    type="datetime-local"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
                <label>
                  Lugar o enlace
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </label>
              </div>
              <button disabled={busy} className="primary">
                Agendar
              </button>
            </form>
          )}
          {canFeedback && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  const row = {
                    id: uid(),
                    application_id: chosen.id,
                    actor_id: user.id,
                    recommendation,
                    note: text,
                    created_at: new Date().toISOString(),
                  };
                  if (demo)
                    persist("nexo-feedback", [...store("nexo-feedback"), row]);
                  else {
                    const r = await supabase!
                      .from("manager_feedback")
                      .insert(row);
                    if (r.error) throw r.error;
                  }
                  setText("");
                });
              }}
            >
              <h3>Feedback gerencial</h3>
              <label>
                Recomendación
                <select
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value)}
                >
                  {["Aprobar", "Rechazar", "Solicitar entrevista"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Observaciones
                <textarea
                  required
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <button disabled={busy || !text.trim()} className="primary">
                Guardar feedback
              </button>
            </form>
          )}
          <small>
            El feedback se habilita en Presentado a gerencia y Entrevista
            gerencial. La selectora confirma los movimientos de etapa.
          </small>
        </>
      )}
      {feedback.map((f) => (
        <div className="interview-card" key={f.id}>
          <strong>{f.recommendation}</strong>
          <p>{f.note}</p>
          <small>{when(f.created_at)}</small>
        </div>
      ))}
    </section>
  );
}
export function Agenda({
  data,
  user,
  demo,
}: {
  data: Data;
  user: Profile;
  demo: boolean;
}) {
  const [rows, setRows] = useState<any[]>([]),
    [offset, setOffset] = useState(0),
    [total, setTotal] = useState(0),
    [error, setError] = useState("");
  const load = async () => {
    if (demo) {
      const ids = new Set(data.applications.map((a) => a.id));
      const all = store("nexo-agenda")
        .filter((a: any) => ids.has(a.application_id))
        .sort((a: any, b: any) => a.starts_at.localeCompare(b.starts_at));
      setRows(all.slice(offset, offset + 25));
      setTotal(all.length);
      return;
    }
    const r = await supabase!
      .from("appointments")
      .select("*, applications(candidates(name), searches(title))", {
        count: "exact",
      })
      .order("starts_at")
      .order("id")
      .range(offset, offset + 24);
    if (r.error) throw r.error;
    setRows(r.data);
    setTotal(r.count || 0);
  };
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [offset, demo, user.id]);
  return (
    <section className="panel settings-card">
      <h2>Agenda de entrevistas</h2>
      <p>
        Agendá desde la ficha del candidato. La agenda y el resultado de
        entrevista se registran por separado.
      </p>
      {error && <div className="error">{error}</div>}
      {rows.map((a) => {
        const app = data.applications.find((x) => x.id === a.application_id);
        return (
          <div className="interview-card" key={a.id}>
            <strong>
              {a.applications?.candidates?.name ||
                data.candidates.find((c) => c.id === app?.candidate_id)?.name ||
                "Candidato"}
            </strong>
            <p>
              {when(a.starts_at)} — {when(a.ends_at)}
            </p>
            <p>
              {a.interviewer} · {a.location} · {a.status}
            </p>
            {user.role === "super_admin" && (
              <select
                aria-label="Estado de cita"
                value={a.status}
                onChange={(e) => {
                  const status = e.target.value;
                  void (async () => {
                    try {
                      if (demo)
                        persist(
                          "nexo-agenda",
                          store("nexo-agenda").map((r: any) =>
                            r.id === a.id ? { ...r, status } : r,
                          ),
                        );
                      else {
                        const r = await supabase!
                          .from("appointments")
                          .update({ status })
                          .eq("id", a.id);
                        if (r.error) throw r.error;
                      }
                      await load();
                    } catch (e: any) {
                      setError(e.message);
                    }
                  })();
                }}
              >
                {["Programada", "Realizada", "Cancelada"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
          </div>
        );
      })}
      {!rows.length && <p>No hay entrevistas agendadas.</p>}
      <Pager offset={offset} total={total} size={25} setOffset={setOffset} />
    </section>
  );
}
export function Pager({
  offset,
  total,
  size = 25,
  setOffset,
}: {
  offset: number;
  total: number;
  size?: number;
  setOffset: (n: number) => void;
}) {
  return (
    <div className="v2-pager">
      <button
        className="secondary"
        disabled={!offset}
        onClick={() => setOffset(Math.max(0, offset - size))}
      >
        Anterior
      </button>
      <span>
        {total ? offset + 1 : 0}–{Math.min(offset + size, total)} de {total}
      </span>
      <button
        className="secondary"
        disabled={offset + size >= total}
        onClick={() => setOffset(offset + size)}
      >
        Siguiente
      </button>
    </div>
  );
}
export function AdvancedReports({ data, demo }: { data: Data; demo: boolean }) {
  const [filters, setFilters] = useState<Record<string, string>>({}),
    [report, setReport] = useState<any>(null),
    [error, setError] = useState("");
  const change = (key: string, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          let result;
          if (!demo) result = await rpc("nexo_report", { p_filters: filters });
          else {
            const searches = data.searches.filter((s) => {
              const r = data.requirements.find(
                (r) => r.id === s.requirement_id,
              );
              return (
                (!filters.client || r?.client_id === filters.client) &&
                (!filters.entity || r?.entity_id === filters.entity) &&
                (!filters.unit || s.unit_id === filters.unit) &&
                (!filters.manager || r?.requester_id === filters.manager) &&
                (!filters.title ||
                  s.title
                    .toLowerCase()
                    .includes(filters.title.toLowerCase())) &&
                (!filters.status || s.status === filters.status) &&
                (!filters.from || s.created_at.slice(0, 10) >= filters.from) &&
                (!filters.to || s.created_at.slice(0, 10) <= filters.to)
              );
            });
            const apps = data.applications.filter((a) =>
              searches.some((s) => s.id === a.search_id),
            );
            const closed = searches.filter(
              (s) => s.status === "Cubierta" && s.closed_at,
            );
            result = {
              searches: searches.length,
              vacancies: searches.reduce((n, s) => n + s.vacancies, 0),
              candidates: new Set(apps.map((a) => a.candidate_id)).size,
              hires: apps.filter((a) => a.stage === "Ingresado").length,
              interviews: data.interviews.filter(
                (i) =>
                  i.result === "Realizada" &&
                  apps.some((a) => a.id === i.application_id),
              ).length,
              average_days: closed.length
                ? Math.round(
                    (closed.reduce(
                      (n, s) =>
                        n +
                        (+new Date(s.closed_at!) - +new Date(s.created_at)) /
                          86400000,
                      0,
                    ) /
                      closed.length) *
                      10,
                  ) / 10
                : null,
              by_client: data.clients.map((c) => {
                const ss = searches.filter(
                  (s) =>
                    data.requirements.find((r) => r.id === s.requirement_id)
                      ?.client_id === c.id,
                );
                return {
                  name: c.name,
                  searches: ss.length,
                  vacancies: ss.reduce((n, s) => n + s.vacancies, 0),
                  hires: apps.filter(
                    (a) =>
                      a.stage === "Ingresado" &&
                      ss.some((s) => s.id === a.search_id),
                  ).length,
                };
              }),
            };
          }
          if (alive) {
            setReport(result);
            setError("");
          }
        } catch (e: any) {
          if (alive) setError(e.message);
        }
      })();
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [filters, demo, data]);
  const quick = (days: number) => {
    const end = new Date(),
      begin = new Date();
    begin.setDate(begin.getDate() - days + 1);
    setFilters((f) => ({
      ...f,
      from: begin.toLocaleDateString("en-CA"),
      to: end.toLocaleDateString("en-CA"),
    }));
  };
  return (
    <>
      <section className="panel settings-card">
        <h2>Filtros del reporte</h2>
        <p>
          El período selecciona la fecha de apertura de las búsquedas; los
          resultados muestran su estado actual.
        </p>
        <div className="form-grid">
          {[
            ["client", "Cliente", data.clients],
            ["entity", "Razón social", data.entities],
            ["unit", "Unidad", data.units],
            [
              "manager",
              "Gerente solicitante",
              data.profiles.filter((p) => p.role === "gerente"),
            ],
          ].map(([key, label, items]) => (
            <label key={key as string}>
              {label as string}
              <select
                value={filters[key as string] || ""}
                onChange={(e) => change(key as string, e.target.value)}
              >
                <option value="">Todos visibles</option>
                {(items as any[]).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            Puesto
            <input
              value={filters.title || ""}
              onChange={(e) => change("title", e.target.value)}
            />
          </label>
          <label>
            Estado
            <select
              value={filters.status || ""}
              onChange={(e) => change("status", e.target.value)}
            >
              <option value="">Todos</option>
              {[
                "En búsqueda",
                "Esperando feedback",
                "Cubierta",
                "Cancelada",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Desde
            <input
              type="date"
              value={filters.from || ""}
              onChange={(e) => change("from", e.target.value)}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={filters.to || ""}
              onChange={(e) => change("to", e.target.value)}
            />
          </label>
        </div>
        <div className="v2-pager">
          <button className="secondary" onClick={() => quick(7)}>
            Últimos 7 días
          </button>
          <button className="secondary" onClick={() => quick(30)}>
            Últimos 30 días
          </button>
          <button className="secondary" onClick={() => setFilters({})}>
            Limpiar
          </button>
          <button
            className="primary"
            disabled={!report}
            onClick={() => downloadCsv(report.by_client)}
          >
            Exportar CSV
          </button>
        </div>
      </section>
      {error && <div className="error">{error}</div>}
      {report && (
        <>
          <div className="metrics report-metrics">
            {[
              ["Búsquedas", report.searches],
              ["Vacantes", report.vacancies],
              ["Candidatos", report.candidates],
              ["Entrevistas realizadas", report.interviews],
              ["Ingresos", report.hires],
              ["Días de cobertura", report.average_days ?? "—"],
            ].map(([label, value]) => (
              <div className="metric" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <section className="panel settings-card">
            <h2>Resultados por cliente</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "Cliente",
                      "Búsquedas",
                      "Vacantes",
                      "Ingresos",
                      "Cobertura",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.by_client.map((r: any) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td>{r.searches}</td>
                      <td>{r.vacancies}</td>
                      <td>{r.hires}</td>
                      <td>
                        {r.vacancies
                          ? Math.round((r.hires / r.vacancies) * 100)
                          : 0}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
function downloadCsv(rows: any[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]),
    escape = (v: any) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replaceAll('"', '""') + '"';
    };
  const url = URL.createObjectURL(
    new Blob(
      [
        "\uFEFF" +
          [
            keys.join(";"),
            ...rows.map((r) => keys.map((k) => escape(r[k])).join(";")),
          ].join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "nexo-reportes.csv";
  a.click();
  URL.revokeObjectURL(url);
}
export function Governance({ demo }: { demo: boolean }) {
  const [settings, setSettings] = useState({
      candidate_days: 730,
      audit_days: 365,
    }),
    [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    [offset, setOffset] = useState(0),
    [total, setTotal] = useState(0);
  useEffect(() => {
    if (demo) return;
    void (async () => {
      const [s, a] = await Promise.all([
        supabase!.from("retention_settings").select("*").single(),
        supabase!
          .from("read_audit")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .order("id")
          .range(offset, offset + 24),
      ]);
      if (s.error || a.error) {
        setError(s.error?.message || a.error!.message);
        return;
      }
      setSettings({
        candidate_days: s.data.candidate_days,
        audit_days: s.data.audit_days,
      });
      setRows(a.data);
      setTotal(a.count || 0);
    })();
  }, [demo, offset]);
  return (
    <section className="panel settings-card">
      <h2>Retención y consultas</h2>
      <p>
        Estos plazos documentan la política a aprobar. No eliminan
        automáticamente fichas, CV ni auditoría. Antes de activar un purgado se
        deben definir consentimientos, excepciones y obligaciones de
        conservación.
      </p>
      {error && <div className="error">{error}</div>}
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void (async () => {
            if (demo) {
              setError("Política guardada solo en esta vista de demostración.");
              return;
            }
            const r = await supabase!
              .from("retention_settings")
              .update({ ...settings, updated_at: new Date().toISOString() })
              .eq("id", true);
            setError(r.error?.message || "Política guardada.");
          })();
        }}
      >
        <div className="form-grid">
          {[
            ["candidate_days", "Conservación de fichas (días)"],
            ["audit_days", "Conservación de auditoría (días)"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min={30}
                required
                value={settings[key as keyof typeof settings]}
                onChange={(e) =>
                  setSettings({ ...settings, [key]: Number(e.target.value) })
                }
              />
            </label>
          ))}
        </div>
        <button className="primary">Guardar política</button>
      </form>
      <h3>Consultas registradas desde NEXO</h3>
      <p>
        Incluye carga de pantallas, fichas, reportes y descarga de CV. No
        registra lecturas directas mediante SQL o cualquier otro cliente de API.
      </p>
      {rows.map((r) => (
        <div className="timeline-row" key={r.id}>
          <span>
            {when(r.created_at)} · {r.resource}
          </span>
          <small>
            Usuario {r.actor_id} · {r.record_id || "Vista general"}
          </small>
        </div>
      ))}
      <Pager offset={offset} total={total} setOffset={setOffset} />
    </section>
  );
}
export function Integrations() {
  return (
    <section className="panel settings-card">
      <h2>Integraciones externas</h2>
      <dl>
        <dt>Identificación / ARCA</dt>
        <dd>
          Pendiente de proveedor y acceso autorizado. La edad usa la fecha de
          nacimiento de la ficha.
        </dd>
        <dt>WhatsApp</dt>
        <dd>
          Enlace manual desde la ficha. API de WhatsApp Business pendiente de
          cuenta, plantillas y credenciales.
        </dd>
        <dt>Firma electrónica</dt>
        <dd>Pendiente de proveedor, documentos y configuración.</dd>
        <dt>IA</dt>
        <dd>
          Pendiente de proveedor, consentimiento y criterios de revisión humana.
          La lectura de texto PDF funciona localmente, sin IA y sin OCR.
        </dd>
        <dt>Portal de candidatos</dt>
        <dd>
          Disponible por invitación de la selectora. Permite ver procesos y CV
          propios y actualizar teléfono y localidad. Requiere desplegar
          invite-candidate y configurar SMTP.
        </dd>
      </dl>
    </section>
  );
}

import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  sessionStorage: { value: dom.window.sessionStorage, configurable: true },
});
const React = await import("react");
const { render, screen, within, waitFor, cleanup, fireEvent } =
  await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { default: App } = await import("../src/App");
const user = userEvent.setup();
render(React.createElement(App));
await user.click(screen.getByRole("button", { name: "Explorar demostración" }));
assert.ok(screen.getByRole("heading", { name: "Buen día, Micaela" }));
await user.click(screen.getByRole("button", { name: "Nuevo requerimiento" }));
let dialog = screen.getByRole("dialog");
const unit = within(dialog).getByLabelText(
  /Unidad · razón social · cliente/,
) as HTMLSelectElement;
await user.selectOptions(unit, unit.options[1].value);
await user.type(within(dialog).getByLabelText(/^Puesto/), "Puesto QA MVP");
await user.type(within(dialog).getByLabelText(/^Área/), "Operaciones");
await user.type(
  within(dialog).getByLabelText(/^Fecha requerida/),
  "2026-11-10",
);
await user.type(
  within(dialog).getByLabelText(/^Descripción del puesto/),
  "Prueba del flujo de extremo a extremo.",
);
await user.click(
  within(dialog).getByRole("button", { name: "Enviar requerimiento" }),
);
await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
await user.click(screen.getByRole("button", { name: /^Solicitudes/ }));
await user.click(screen.getByText("Puesto QA MVP"));
// Open the request through its explicit action button in the row.
if (!screen.queryByRole("dialog")) {
  const row = screen.getByText("Puesto QA MVP").closest("tr")!;
  await user.click(within(row).getByRole("button", { name: "Revisar" }));
}
dialog = screen.getByRole("dialog");
await user.click(
  within(dialog).getByRole("button", { name: "Aprobar solicitud" }),
);
await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
await user.click(screen.getByRole("button", { name: /^Búsquedas$/ }));
await user.click(screen.getByRole("button", { name: "Puesto QA MVP" }));
await user.click(screen.getByRole("button", { name: "Agregar candidato" }));
dialog = screen.getByRole("dialog");
await user.type(
  within(dialog).getByLabelText(/^Nombre completo/),
  "Persona QA",
);
await user.type(within(dialog).getByLabelText(/^DNI/), "99887766");
await user.click(within(dialog).getByRole("button", { name: "Guardar" }));
await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
assert.ok(screen.getByRole("button", { name: "Persona QA" }));
const card = screen
  .getByRole("button", { name: "Persona QA" })
  .closest("article")!;
await user.click(within(card).getByRole("button", { name: "Cambiar etapa" }));
dialog = screen.getByRole("dialog");
await user.selectOptions(
  within(dialog).getByLabelText(/^Nuevo estado/),
  "Contactado",
);
await user.type(
  within(dialog).getByLabelText(/^Observación/),
  "Contacto confirmado durante QA",
);
await user.click(
  within(dialog).getByRole("button", { name: "Registrar movimiento" }),
);
await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
await user.click(screen.getByRole("button", { name: "Persona QA" }));
dialog = screen.getByRole("dialog");
assert.ok(within(dialog).getByText("Contacto confirmado durante QA"));
await user.click(within(dialog).getByRole("button", { name: "Cerrar" }));
await user.click(screen.getByRole("button", { name: "Agregar candidato" }));
dialog = screen.getByRole("dialog");
await user.type(
  within(dialog).getByLabelText(/^Nombre completo/),
  "Otra ficha duplicada",
);
await user.type(within(dialog).getByLabelText(/^DNI/), "99887766");
await user.click(within(dialog).getByRole("button", { name: "Guardar" }));
assert.ok(within(dialog).getByRole("heading", { name: "Candidato existente" }));
await user.click(within(dialog).getByRole("button", { name: "Cerrar" }));
// v2: edit ficha, schedule an appointment, move to managerial review and record feedback.
await user.click(screen.getByRole("button", { name: "Persona QA" }));
dialog = screen.getByRole("dialog");
await user.click(within(dialog).getByRole("button", { name: "Editar ficha" }));
dialog = screen.getByRole("dialog");
await user.type(within(dialog).getByLabelText("Localidad"), "Buenos Aires");
await user.click(within(dialog).getByRole("button", { name: "Guardar" }));
await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
await user.click(screen.getByRole("button", { name: "Persona QA" }));
dialog = screen.getByRole("dialog");
const process = within(dialog).getByLabelText("Proceso") as HTMLSelectElement;
await user.selectOptions(process, process.options[1].value);
fireEvent.change(within(dialog).getByLabelText("Inicio"), {
  target: { value: "2027-01-10T10:00" },
});
fireEvent.change(within(dialog).getByLabelText("Fin"), {
  target: { value: "2027-01-10T11:00" },
});
await user.click(within(dialog).getByRole("button", { name: "Agendar" }));
await waitFor(() =>
  assert.equal(
    JSON.parse(sessionStorage.getItem("nexo-agenda") || "[]").length,
    1,
  ),
);
await user.click(within(dialog).getByRole("button", { name: "Cerrar" }));
await user.click(
  within(
    screen.getByRole("button", { name: "Persona QA" }).closest("article")!,
  ).getByRole("button", { name: "Cambiar etapa" }),
);
dialog = screen.getByRole("dialog");
await user.selectOptions(
  within(dialog).getByLabelText(/^Nuevo estado/),
  "Presentado a gerencia",
);
await user.type(
  within(dialog).getByLabelText(/^Observación/),
  "Enviar a gerente",
);
await user.click(
  within(dialog).getByRole("button", { name: "Registrar movimiento" }),
);
await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
await user.click(screen.getByRole("button", { name: "Persona QA" }));
dialog = screen.getByRole("dialog");
const process2 = within(dialog).getByLabelText("Proceso") as HTMLSelectElement;
await user.selectOptions(process2, process2.options[1].value);
await user.type(
  within(dialog).getByLabelText("Observaciones"),
  "Perfil aprobado por revisión",
);
await user.click(
  within(dialog).getByRole("button", { name: "Guardar feedback" }),
);
await waitFor(() =>
  assert.equal(
    JSON.parse(sessionStorage.getItem("nexo-feedback") || "[]").length,
    1,
  ),
);
await user.click(within(dialog).getByRole("button", { name: "Cerrar" }));
await user.click(screen.getByRole("button", { name: "Agenda", exact: true }));
assert.ok(await screen.findByText("Persona QA"));
await user.click(screen.getByRole("button", { name: "Reportes", exact: true }));
assert.ok(screen.getByLabelText("Gerente solicitante"));
assert.ok(await screen.findByText("Resultados por cliente"));
const view = screen.getByRole("combobox", {
  name: "Cambiar usuario de demostración",
}) as HTMLSelectElement;
await user.selectOptions(view, view.options[1].value);
assert.equal(screen.queryByRole("button", { name: "Configuración" }), null);
assert.equal(screen.queryByRole("button", { name: "Usuarios" }), null);
assert.equal(screen.queryByText("Grupo Andina Servicios S.R.L."), null);
const stored = JSON.parse(sessionStorage.getItem("nexo-demo")!);
assert.equal(
  stored.candidates.filter((c: any) => c.dni === "99887766").length,
  1,
);
cleanup();
console.log(
  "PASS: demo, requirement submission and approval, search creation, candidate creation, stage history, duplicate prevention and manager UI.",
);

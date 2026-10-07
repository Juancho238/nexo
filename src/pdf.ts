export async function readPdf(file: Blob): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const { default: worker } =
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const pdf = await task.promise;
  try {
    if (pdf.numPages > 40)
      throw new Error("El CV supera el límite de 40 páginas.");
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text +=
        content.items.map((item) => ("str" in item ? item.str : "")).join(" ") +
        "\n";
      if (text.length > 60000)
        throw new Error("El texto supera el límite de lectura.");
    }
    return (
      text.trim() ||
      "No se encontró texto. Este PDF puede ser escaneado: requiere OCR, que todavía no está configurado."
    );
  } finally {
    await task.destroy();
  }
}

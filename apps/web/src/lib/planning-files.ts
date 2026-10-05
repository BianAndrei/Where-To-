export async function fingerprint(source: Blob | string) {
  const bytes =
    typeof source === "string"
      ? new TextEncoder().encode(source)
      : await source.arrayBuffer();
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function readPlanningFile(
  file: File,
  progress: (v: string) => void,
  language = "eng",
) {
  if (file.size > 8 * 1024 * 1024)
    throw new Error("Choose a file smaller than 8 MB.");
  let worker: import("tesseract.js").Worker | undefined;
  async function ocr(canvas: HTMLCanvasElement) {
    progress("Reading the image on your device…");
    if (!worker) {
      const { createWorker } = await import("tesseract.js");
      let expired = false;
      let initTimer: ReturnType<typeof setTimeout> | undefined;
      const pending = createWorker(language, 1, {
        logger: (m) => {
          if (m.status === "recognizing text")
            progress(`Reading text · ${Math.round(m.progress * 100)}%`);
        },
      });
      void pending
        .then((w) => {
          if (expired) void w.terminate();
        })
        .catch(() => {});
      try {
        worker = await Promise.race([
          pending,
          new Promise<never>((_, reject) => {
            initTimer = setTimeout(() => {
              expired = true;
              reject(
                new Error(
                  "The text reader could not load. Check your connection or paste the text instead.",
                ),
              );
            }, 45000);
          }),
        ]);
      } finally {
        clearTimeout(initTimer);
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        worker.recognize(canvas).then((r) => r.data.text),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            void worker?.terminate();
            reject(
              new Error(
                "Reading took too long. Try a clearer photo or paste the text.",
              ),
            );
          }, 90000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    if (/\.(txt|eml)$/i.test(file.name)) {
      const text = await file.text();
      if (text.length > 100000)
        throw new Error("Choose a shorter confirmation.");
      return text;
    }
    if (/\.pdf$/i.test(file.name)) {
      progress("Reading your PDF…");
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = (
        await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
      ).default;
      const loading = getDocument({ data: await file.arrayBuffer() });
      try {
        const pdf = await loading.promise;
        if (pdf.numPages > 10)
          throw new Error("Choose a confirmation with at most 10 pages.");
        let text = "";
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          let pageText = content.items
            .map((x: any) =>
              "str" in x ? x.str + (x.hasEOL ? "\n" : " ") : "",
            )
            .join("");
          if (!pageText.trim()) {
            const viewport = page.getViewport({ scale: 1.5 });
            if (viewport.width * viewport.height > 12000000)
              throw new Error(
                "This PDF page is too large to read. Use a cropped image.",
              );
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({
              canvas,
              canvasContext: canvas.getContext("2d")!,
              viewport,
            }).promise;
            pageText = await ocr(canvas);
            canvas.width = canvas.height = 0;
          }
          text += pageText + "\n";
          if (text.length > 100000)
            throw new Error(
              "This document contains too much text. Choose just the confirmation pages.",
            );
        }
        return text;
      } finally {
        await loading.destroy();
      }
    }
    if (!/\.(png|jpe?g|webp)$/i.test(file.name))
      throw new Error("Choose a PDF, photo or plain text confirmation.");
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > 40000000)
        throw new Error("Crop the photo to the receipt or confirmation first.");
      const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width * scale;
      canvas.height = bitmap.height * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return await ocr(canvas);
    } finally {
      bitmap.close();
    }
  } finally {
    await worker?.terminate();
  }
}

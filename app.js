"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const state = {
    imageFile: null,
    imageUrl: null,
    rotation: 0,
    ocrWorker: null,
    ocrWorkerPromise: null,
    processing: false,
    translating: false
  };

  // --------------------------------------------------
  // 1. NAVIGATION
  // --------------------------------------------------

  const navButtons = document.querySelectorAll(".nav-btn");
  const toolViews = document.querySelectorAll(".tool-view");

  function showView(viewId) {
    const target = $(viewId);
    if (!target) return;

    toolViews.forEach((view) => {
      const active = view.id === viewId;
      view.hidden = !active;
      view.classList.toggle("active", active);
    });

    navButtons.forEach((button) => {
      const active = button.dataset.view === viewId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    window.scrollTo({
      top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - 85),
      behavior: "smooth"
    });
  }

  navButtons.forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  // --------------------------------------------------
  // 2. NOTIFICATIONS AND PROGRESS
  // --------------------------------------------------

  function showNotice(id, message, type = "") {
    const box = $(id);
    if (!box) return;

    box.textContent = message;
    box.className = "notice show";

    if (type) box.classList.add(type);
  }

  function hideNotice(id) {
    const box = $(id);
    if (!box) return;

    box.textContent = "";
    box.className = "notice";
  }

  function setProgress(barId, statusId, percent, message) {
    const bar = $(barId);
    const status = $(statusId);

    if (bar) {
      bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }

    if (status) status.textContent = message;
  }

  // --------------------------------------------------
  // 3. IMAGE UPLOAD AND PREVIEW
  // --------------------------------------------------

  const imageInput = $("image-input");
  const uploadZone = $("upload-zone");
  const imagePreview = $("image-preview");
  const ocrResult = $("ocr-result");

  function releaseImageUrl() {
    if (state.imageUrl) {
      URL.revokeObjectURL(state.imageUrl);
      state.imageUrl = null;
    }
  }

  function resetImage() {
    releaseImageUrl();

    state.imageFile = null;
    state.rotation = 0;

    if (imageInput) imageInput.value = "";

    if (imagePreview) {
      imagePreview.replaceChildren();

      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Your image preview will appear here.";
      imagePreview.appendChild(empty);
    }

    $("rotate-btn").disabled = true;
    $("clear-image-btn").disabled = true;
    $("extract-text-btn").disabled = true;

    setProgress(
      "ocr-progress-bar",
      "ocr-status",
      0,
      "Waiting for an image."
    );

    hideNotice("ocr-notice");
  }

  function loadImageFile(file) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showNotice("ocr-notice", "Please select a valid image.", "error");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      showNotice(
        "ocr-notice",
        "Image is larger than 20 MB. Choose a smaller image.",
        "error"
      );
      return;
    }

    releaseImageUrl();

    state.imageFile = file;
    state.rotation = 0;
    state.imageUrl = URL.createObjectURL(file);

    const image = document.createElement("img");
    image.alt = "Uploaded image preview";
    image.src = state.imageUrl;

    image.addEventListener("load", () => {
      imagePreview.replaceChildren(image);

      $("rotate-btn").disabled = false;
      $("clear-image-btn").disabled = false;
      $("extract-text-btn").disabled = false;

      setProgress(
        "ocr-progress-bar",
        "ocr-status",
        0,
        "Image ready. Click Extract Text."
      );

      hideNotice("ocr-notice");
    }, { once: true });

    image.addEventListener("error", () => {
      resetImage();
      showNotice(
        "ocr-notice",
        "Could not open this image. Please try another one.",
        "error"
      );
    }, { once: true });
  }

  $("choose-image-btn").addEventListener("click", () => {
    imageInput.removeAttribute("capture");
    imageInput.click();
  });

  $("camera-btn").addEventListener("click", () => {
    imageInput.setAttribute("capture", "environment");
    imageInput.click();
  });

  imageInput.addEventListener("change", (event) => {
    loadImageFile(event.target.files?.[0]);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    uploadZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    uploadZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadZone.classList.remove("dragover");
    });
  });

  uploadZone.addEventListener("drop", (event) => {
    loadImageFile(event.dataTransfer?.files?.[0]);
  });

  $("rotate-btn").addEventListener("click", () => {
    const image = imagePreview.querySelector("img");
    if (!image) return;

    state.rotation = (state.rotation + 90) % 360;
    image.style.transform = `rotate(${state.rotation}deg)`;
  });

  $("clear-image-btn").addEventListener("click", resetImage);

  // --------------------------------------------------
  // 4. OCR WORKER — REUSE FOR BETTER PERFORMANCE
  // --------------------------------------------------

  async function getOcrWorker() {
    if (state.ocrWorker) return state.ocrWorker;
    if (state.ocrWorkerPromise) return state.ocrWorkerPromise;

    if (!window.Tesseract || !window.Tesseract.createWorker) {
      throw new Error(
        "OCR library did not load. Check your internet connection and reload the website."
      );
    }

    state.ocrWorkerPromise = (async () => {
      const worker = await Tesseract.createWorker("eng", 1, {
        logger: (info) => {
          if (info.status === "recognizing text" && typeof info.progress === "number") {
            const percent = Math.round(info.progress * 100);

            setProgress(
              "ocr-progress-bar",
              "ocr-status",
              percent,
              `Recognizing text: ${percent}%`
            );
          } else if (info.status) {
            setProgress(
              "ocr-progress-bar",
              "ocr-status",
              5,
              `Preparing OCR: ${info.status}`
            );
          }
        }
      });

      state.ocrWorker = worker;
      return worker;
    })();

    try {
      return await state.ocrWorkerPromise;
    } finally {
      state.ocrWorkerPromise = null;
    }
  }

  function createOcrImage() {
    return new Promise((resolve, reject) => {
      const original = new Image();

      original.onload = () => {
        try {
          const naturalWidth = original.naturalWidth;
          const naturalHeight = original.naturalHeight;

          if (!naturalWidth || !naturalHeight) {
            reject(new Error("Image dimensions could not be read."));
            return;
          }

          // Limit very large images to reduce memory use.
          const maxDimension = 2200;
          const scale = Math.min(
            1,
            maxDimension / Math.max(naturalWidth, naturalHeight)
          );

          const width = Math.max(1, Math.round(naturalWidth * scale));
          const height = Math.max(1, Math.round(naturalHeight * scale));

          const canvas = document.createElement("canvas");

          if (state.rotation % 180 === 90) {
            canvas.width = height;
            canvas.height = width;
          } else {
            canvas.width = width;
            canvas.height = height;
          }

          const context = canvas.getContext("2d", { willReadFrequently: true });

          if (!context) {
            reject(new Error("Your browser could not prepare the image."));
            return;
          }

          context.save();
          context.translate(canvas.width / 2, canvas.height / 2);
          context.rotate((state.rotation * Math.PI) / 180);
          context.drawImage(original, -width / 2, -height / 2, width, height);
          context.restore();

          resolve(canvas);
        } catch (error) {
          reject(error);
        }
      };

      original.onerror = () => {
        reject(new Error("Could not read the selected image."));
      };

      original.src = state.imageUrl;
    });
  }

  $("extract-text-btn").addEventListener("click", async () => {
    if (state.processing) return;

    if (!state.imageFile) {
      showNotice("ocr-notice", "Upload an image first.", "error");
      return;
    }

    state.processing = true;
    $("extract-text-btn").disabled = true;

    setProgress(
      "ocr-progress-bar",
      "ocr-status",
      2,
      "Preparing your image..."
    );

    hideNotice("ocr-notice");

    try {
      const canvas = await createOcrImage();

      setProgress(
        "ocr-progress-bar",
        "ocr-status",
        5,
        "Loading OCR engine. First use may take longer..."
      );

      const worker = await getOcrWorker();

      setProgress(
        "ocr-progress-bar",
        "ocr-status",
        10,
        "Reading text..."
      );

      const result = await worker.recognize(canvas);
      const text = (result.data.text || "").trim();

      ocrResult.value = text;
      $("ocr-result-count").textContent =
        `${text.length.toLocaleString()} characters`;

      setProgress(
        "ocr-progress-bar",
        "ocr-status",
        100,
        "Finished."
      );

      if (text) {
        showNotice(
          "ocr-notice",
          "Text extraction completed. Review the result and correct any mistakes.",
          "success"
        );
      } else {
        showNotice(
          "ocr-notice",
          "No text was detected. Try a clearer, sharper image with good lighting.",
          "error"
        );
      }
    } catch (error) {
      console.error("OCR error:", error);

      showNotice(
        "ocr-notice",
        error.message || "OCR failed. Check your internet connection and try again.",
        "error"
      );

      setProgress(
        "ocr-progress-bar",
        "ocr-status",
        0,
        "OCR could not complete."
      );
    } finally {
      state.processing = false;
      $("extract-text-btn").disabled = !state.imageFile;
    }
  });

  // --------------------------------------------------
  // 5. TEXT DOWNLOAD AND COPY
  // --------------------------------------------------

  async function copyText(text, noticeId) {
    if (!text.trim()) {
      showNotice(noticeId, "There is no text to copy.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showNotice(noticeId, "Text copied successfully.", "success");
    } catch (_) {
      const temporary = document.createElement("textarea");
      temporary.value = text;
      temporary.style.position = "fixed";
      temporary.style.opacity = "0";

      document.body.appendChild(temporary);
      temporary.select();

      let copied = false;

      try {
        copied = document.execCommand("copy");
      } catch (_) {
        copied = false;
      }

      temporary.remove();

      showNotice(
        noticeId,
        copied
          ? "Text copied successfully."
          : "Copy blocked by browser. Select the text and copy it manually.",
        copied ? "success" : "error"
      );
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function downloadText(text, filename, noticeId) {
    if (!text.trim()) {
      showNotice(noticeId, "There is no text to download.", "error");
      return;
    }

    downloadBlob(
      new Blob(["\uFEFF", text], { type: "text/plain;charset=utf-8" }),
      filename
    );

    showNotice(noticeId, "Text file downloaded.", "success");
  }

  $("copy-ocr-btn").addEventListener("click", () => {
    copyText(ocrResult.value, "ocr-notice");
  });

  $("download-ocr-btn").addEventListener("click", () => {
    downloadText(ocrResult.value, "naol-extracted-text.txt", "ocr-notice");
  });

  $("send-to-translate-btn").addEventListener("click", () => {
    if (!ocrResult.value.trim()) {
      showNotice("ocr-notice", "Extract or enter text first.", "error");
      return;
    }

    $("source-text").value = ocrResult.value;
    showView("translate-view");
    showNotice(
      "translation-status",
      "Text transferred. Choose the target language and translate.",
      "success"
    );
  });

  // --------------------------------------------------
  // 6. PDF TEXT EXTRACTION
  // --------------------------------------------------

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  $("extract-pdf-btn").addEventListener("click", async () => {
    const file = $("pdf-input").files?.[0];

    if (!file) {
      showNotice("pdf-notice", "Please choose a PDF file first.", "error");
      return;
    }

    if (!window.pdfjsLib) {
      showNotice(
        "pdf-notice",
        "PDF library did not load. Check your internet connection.",
        "error"
      );
      return;
    }

    const button = $("extract-pdf-btn");
    button.disabled = true;

    $("pdf-result").value = "";
    hideNotice("pdf-notice");

    let pdfDocument = null;

    try {
      const bytes = await file.arrayBuffer();

      pdfDocument = await pdfjsLib.getDocument({
        data: new Uint8Array(bytes)
      }).promise;

      let fullText = "";

      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
        setProgress(
          "pdf-progress-bar",
          "pdf-status",
          Math.round(((pageNumber - 1) / pdfDocument.numPages) * 100),
          `Reading page ${pageNumber} of ${pdfDocument.numPages}...`
        );

        const page = await pdfDocument.getPage(pageNumber);
        const content = await page.getTextContent();

        const pageText = content.items
          .map((item) => item.str || "")
          .join(" ");

        fullText += `\n--- Page ${pageNumber} ---\n${pageText}\n`;
      }

      $("pdf-result").value = fullText.trim();

      setProgress(
        "pdf-progress-bar",
        "pdf-status",
        100,
        `Finished: ${pdfDocument.numPages} page(s).`
      );

      if (fullText.trim()) {
        showNotice(
          "pdf-notice",
          "PDF text extracted successfully.",
          "success"
        );
      } else {
        showNotice(
          "pdf-notice",
          "No selectable text found. This PDF may contain scanned images; use OCR on its pages.",
          "error"
        );
      }
    } catch (error) {
      console.error("PDF extraction error:", error);

      showNotice(
        "pdf-notice",
        "Could not read this PDF. Try another PDF file.",
        "error"
      );

      setProgress("pdf-progress-bar", "pdf-status", 0, "PDF extraction failed.");
    } finally {
      button.disabled = false;
    }
  });

  $("clear-pdf-btn").addEventListener("click", () => {
    $("pdf-input").value = "";
    $("pdf-result").value = "";

    setProgress(
      "pdf-progress-bar",
      "pdf-status",
      0,
      "Choose a PDF to begin."
    );

    hideNotice("pdf-notice");
  });

  $("copy-pdf-btn").addEventListener("click", () => {
    copyText($("pdf-result").value, "pdf-notice");
  });

  $("download-pdf-text-btn").addEventListener("click", () => {
    downloadText(
      $("pdf-result").value,
      "naol-pdf-text.txt",
      "pdf-notice"
    );
  });

  // --------------------------------------------------
  // 7. TRANSLATION
  // Uses Google's public translation endpoint.
  // It requires internet access and may be rate-limited.
  // --------------------------------------------------

  $("swap-languages-btn").addEventListener("click", () => {
    const sourceLang = $("source-language");
    const targetLang = $("target-language");
    const sourceText = $("source-text");
    const translatedText = $("translated-text");

    const oldLanguage = sourceLang.value;
    sourceLang.value = targetLang.value;
    targetLang.value = oldLanguage;

    const oldText = sourceText.value;
    sourceText.value = translatedText.value;
    translatedText.value = oldText;

    hideNotice("translation-status");
  });

  $("clear-source-btn").addEventListener("click", () => {
    $("source-text").value = "";
    $("translated-text").value = "";
    hideNotice("translation-status");
  });

  $("paste-source-btn").addEventListener("click", async () => {
    try {
      $("source-text").value = await navigator.clipboard.readText();
      showNotice("translation-status", "Text pasted.", "success");
    } catch (_) {
      showNotice(
        "translation-status",
        "Clipboard access was blocked. Paste the text manually.",
        "error"
      );
    }
  });

  $("copy-translation-btn").addEventListener("click", () => {
    copyText($("translated-text").value, "translation-status");
  });

  $("translate-btn").addEventListener("click", async () => {
    if (state.translating) return;

    const text = $("source-text").value.trim();
    const source = $("source-language").value;
    const target = $("target-language").value;

    if (!text) {
      showNotice("translation-status", "Enter text to translate.", "error");
      return;
    }

    if (source === target) {
      $("translated-text").value = text;
      showNotice(
        "translation-status",
        "Source and target languages are the same.",
        "success"
      );
      return;
    }

    state.translating = true;
    $("translate-btn").disabled = true;
    $("translate-btn").textContent = "Translating...";

    try {
      const endpoint = new URL(
        "https://translate.googleapis.com/translate_a/single"
      );

      endpoint.searchParams.set("client", "gtx");
      endpoint.searchParams.set("sl", source);
      endpoint.searchParams.set("tl", target);
      endpoint.searchParams.set("dt", "t");
      endpoint.searchParams.set("q", text);

      const response = await fetch(endpoint.toString());

      if (!response.ok) {
        throw new Error("Translation service returned an error.");
      }

      const data = await response.json();

      const translated = Array.isArray(data[0])
        ? data[0].map((part) => part?.[0] || "").join("")
        : "";

      if (!translated.trim()) {
        throw new Error("The translation service returned no text.");
      }

      $("translated-text").value = translated;

      showNotice(
        "translation-status",
        "Translation completed. Please review the result for accuracy.",
        "success"
      );
    } catch (error) {
      console.error("Translation error:", error);

      showNotice(
        "translation-status",
        "Translation failed. Check your internet connection and try again. This public service may temporarily limit requests.",
        "error"
      );
    } finally {
      state.translating = false;
      $("translate-btn").disabled = false;
      $("translate-btn").textContent = "Translate";
    }
  });

  $("use-translation-btn").addEventListener("click", () => {
    const text = $("translated-text").value;

    if (!text.trim()) {
      showNotice("translation-status", "Translate text first.", "error");
      return;
    }

    $("handwriting-input").value = text;
    renderHandwriting();
    showView("handwriting-view");
  });

  // --------------------------------------------------
  // 8. HANDWRITING PREVIEW
  // --------------------------------------------------

  function renderHandwriting() {
    const input = $("handwriting-input");
    const preview = $("handwriting-preview");

    preview.textContent =
      input.value || "Your handwriting preview will appear here.";

    const font = $("handwriting-font").value;
    const size = Number($("handwriting-size").value) || 28;

    preview.style.fontFamily =
      font === "Caveat" ? "'Caveat', cursive" : font;

    preview.style.fontSize = `${size}px`;

    preview.style.backgroundImage =
      "repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(70,90,130,.12) 40px)";
  }

  $("render-handwriting-btn").addEventListener("click", () => {
    renderHandwriting();
    showNotice("handwriting-notice", "Preview updated.", "success");
  });

  $("handwriting-input").addEventListener("input", renderHandwriting);
  $("handwriting-font").addEventListener("change", renderHandwriting);
  $("handwriting-size").addEventListener("change", renderHandwriting);

  // --------------------------------------------------
  // 9. HANDWRITING EXPORT
  // --------------------------------------------------

  async function createHandwritingCanvas() {
    if (!window.html2canvas) {
      throw new Error("Image export library did not load.");
    }

    renderHandwriting();

    const preview = $("handwriting-preview");

    await document.fonts.ready;

    return html2canvas(preview, {
      scale: 2,
      backgroundColor: "#fffdf6",
      useCORS: true,
      logging: false
    });
  }

  async function exportHandwriting(format) {
    try {
      showNotice("handwriting-notice", "Preparing your download...", "");

      const canvas = await createHandwritingCanvas();

      if (format === "png") {
        canvas.toBlob((blob) => {
          if (!blob) {
            showNotice("handwriting-notice", "Could not create PNG.", "error");
            return;
          }

          downloadBlob(blob, "naol-handwriting.png");

          showNotice(
            "handwriting-notice",
            "PNG downloaded successfully.",
            "success"
          );
        }, "image/png");

        return;
      }

      if (format === "jpg") {
        canvas.toBlob((blob) => {
          if (!blob) {
            showNotice("handwriting-notice", "Could not create JPG.", "error");
            return;
          }

          downloadBlob(blob, "naol-handwriting.jpg");

          showNotice(
            "handwriting-notice",
            "JPG downloaded successfully.",
            "success"
          );
        }, "image/jpeg", 0.95);

        return;
      }

      if (format === "pdf") {
        if (!window.jspdf?.jsPDF) {
          throw new Error("PDF export library did not load.");
        }

        const { jsPDF } = window.jspdf;
        const imageData = canvas.toDataURL("image/png");

        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? "landscape" : "portrait",
          unit: "px",
          format: [canvas.width, canvas.height]
        });

        pdf.addImage(
          imageData,
          "PNG",
          0,
          0,
          canvas.width,
          canvas.height
        );

        pdf.save("naol-handwriting.pdf");

        showNotice(
          "handwriting-notice",
          "PDF downloaded successfully.",
          "success"
        );
      }
    } catch (error) {
      console.error("Handwriting export error:", error);

      showNotice(
        "handwriting-notice",
        error.message || "Export failed. Please try again.",
        "error"
      );
    }
  }

  $("download-handwriting-png-btn").addEventListener("click", () => {
    exportHandwriting("png");
  });

  $("download-handwriting-jpg-btn").addEventListener("click", () => {
    exportHandwriting("jpg");
  });

  $("download-handwriting-pdf-btn").addEventListener("click", () => {
    exportHandwriting("pdf");
  });

  // --------------------------------------------------
  // 10. INITIAL STATE
  // --------------------------------------------------

  showView("ocr-view");
  resetImage();
  renderHandwriting();

  console.log("Naol Converter loaded successfully.");
});

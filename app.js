"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const state = {
    imageFile: null,
    imageUrl: null,
    rotation: 0,
    processing: false,
    translating: false
  };

  // ------------------------------
  // 1. NAVIGATION
  // ------------------------------

  const navButtons = document.querySelectorAll(".nav-btn");
  const toolViews = document.querySelectorAll(".tool-view");

  function showView(viewId) {
    const target = $(viewId);

    if (!target) {
      console.error("Tool view not found:", viewId);
      return;
    }

    toolViews.forEach((view) => {
      const isActive = view.id === viewId;

      view.hidden = !isActive;
      view.classList.toggle("active", isActive);
    });

    navButtons.forEach((button) => {
      const isActive = button.dataset.view === viewId;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    window.scrollTo({
      top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - 95),
      behavior: "smooth"
    });
  }

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      showView(button.dataset.view);
    });
  });

  // ------------------------------
  // 2. NOTIFICATIONS
  // ------------------------------

  function showNotice(id, message, type = "") {
    const box = $(id);
    if (!box) return;

    box.textContent = message;
    box.className = "notice show";

    if (type) {
      box.classList.add(type);
    }
  }

  function hideNotice(id) {
    const box = $(id);
    if (!box) return;

    box.textContent = "";
    box.className = "notice";
  }

  // ------------------------------
  // 3. IMAGE UPLOAD
  // ------------------------------

  const imageInput = $("image-input");
  const uploadZone = $("upload-zone");
  const chooseImageBtn = $("choose-image-btn");
  const cameraBtn = $("camera-btn");
  const rotateBtn = $("rotate-btn");
  const clearImageBtn = $("clear-image-btn");
  const extractTextBtn = $("extract-text-btn");
  const imagePreview = $("image-preview");
  const ocrStatus = $("ocr-status");
  const ocrProgressBar = $("ocr-progress-bar");
  const ocrResult = $("ocr-result");

  function setOcrStatus(message, percent = 0) {
    if (ocrStatus) {
      ocrStatus.textContent = message;
    }

    if (ocrProgressBar) {
      const safePercent = Math.min(100, Math.max(0, Number(percent) || 0));
      ocrProgressBar.style.width = safePercent + "%";
    }
  }

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

    if (rotateBtn) rotateBtn.disabled = true;
    if (clearImageBtn) clearImageBtn.disabled = true;
    if (extractTextBtn) extractTextBtn.disabled = true;

    setOcrStatus("Waiting for an image.", 0);
    hideNotice("ocr-notice");
  }

  function loadImageFile(file) {
    if (!file) return;

    if (!file.type || !file.type.startsWith("image/")) {
      showNotice("ocr-notice", "Please select a valid image file.", "error");
      return;
    }

    const maxSize = 20 * 1024 * 1024;

    if (file.size > maxSize) {
      showNotice(
        "ocr-notice",
        "This image is larger than 20 MB. Please choose a smaller image for faster processing.",
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
    image.style.transform = "rotate(0deg)";

    image.addEventListener("load", () => {
      if (imagePreview) {
        imagePreview.replaceChildren(image);
      }

      if (rotateBtn) rotateBtn.disabled = false;
      if (clearImageBtn) clearImageBtn.disabled = false;
      if (extractTextBtn) extractTextBtn.disabled = false;

      setOcrStatus("Image ready. Click Extract Text to continue.", 0);
      hideNotice("ocr-notice");
    }, { once: true });

    image.addEventListener("error", () => {
      showNotice("ocr-notice", "The image could not be loaded. Please try another image.", "error");
      resetImage();
    }, { once: true });
  }

  if (chooseImageBtn && imageInput) {
    chooseImageBtn.addEventListener("click", () => {
      imageInput.click();
    });
  }

  if (cameraBtn && imageInput) {
    cameraBtn.addEventListener("click", () => {
      imageInput.setAttribute("accept", "image/*");
      imageInput.setAttribute("capture", "environment");
      imageInput.click();
    });
  }

  if (imageInput) {
    imageInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      loadImageFile(file);
    });
  }

  if (uploadZone) {
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
      const file = event.dataTransfer?.files?.[0];
      if (file) loadImageFile(file);
    });
  }

  if (rotateBtn) {
    rotateBtn.addEventListener("click", () => {
      const image = imagePreview?.querySelector("img");
      if (!image) return;

      state.rotation = (state.rotation + 90) % 360;
      image.style.transform = `rotate(${state.rotation}deg)`;
    });
  }

  if (clearImageBtn) {
    clearImageBtn.addEventListener("click", resetImage);
  }

  // ------------------------------
  // 4. CHARACTER COUNTS
  // ------------------------------

  function updateCharacterCount(textareaId, outputId) {
    const textarea = $(textareaId);
    const output = $(outputId);

    if (!textarea || !output) return;

    const count = textarea.value.length;
    output.textContent = `${count.toLocaleString()} characters`;
  }

  if (ocrResult) {
    ocrResult.addEventListener("input", () => {
      updateCharacterCount("ocr-result", "ocr-result-count");
    });
  }

  // ------------------------------
  // 5. CLIPBOARD HELPERS
  // ------------------------------

  async function copyText(text, noticeId) {
    if (!text.trim()) {
      showNotice(noticeId, "There is no text to copy.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showNotice(noticeId, "Text copied successfully.", "success");
    } catch (error) {
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

      if (copied) {
        showNotice(noticeId, "Text copied successfully.", "success");
      } else {
        showNotice(
          noticeId,
          "Copy was blocked by your browser. Select the text and copy it manually.",
          "error"
        );
      }
    }
  }

  function downloadText(text, filename, noticeId) {
    if (!text.trim()) {
      showNotice(noticeId, "There is no text to download.", "error");
      return;
    }

    const blob = new Blob(["\uFEFF", text], {
      type: "text/plain;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showNotice(noticeId, "Your text file has been downloaded.", "success");
  }

  // ------------------------------
  // 6. OCR BUTTON
  // Full OCR processing is added in Part 3.
  // ------------------------------

  if (extractTextBtn) {
    extractTextBtn.addEventListener("click", () => {
      if (!state.imageFile) {
        showNotice("ocr-notice", "Please upload an image first.", "error");
        return;
      }

      showNotice(
        "ocr-notice",
        "Image loaded. The OCR processing engine will be connected in Part 3.",
        ""
      );
    });
  }

  // ------------------------------
  // 7. OCR RESULT BUTTONS
  // ------------------------------

  $("copy-ocr-btn")?.addEventListener("click", () => {
    copyText(ocrResult?.value || "", "ocr-notice");
  });

  $("download-ocr-btn")?.addEventListener("click", () => {
    downloadText(ocrResult?.value || "", "naol-extracted-text.txt", "ocr-notice");
  });

  $("send-to-translate-btn")?.addEventListener("click", () => {
    const text = ocrResult?.value || "";

    if (!text.trim()) {
      showNotice("ocr-notice", "Extract or enter some text first.", "error");
      return;
    }

    $("source-text").value = text;
    showView("translate-view");
    showNotice("translation-status", "Text copied from Image to Text. Choose the target language and translate.", "success");
  });

  // ------------------------------
  // 8. PDF BUTTONS
  // PDF processing is added in Part 3.
  // ------------------------------

  $("extract-pdf-btn")?.addEventListener("click", () => {
    showNotice(
      "pdf-notice",
      "PDF processing engine will be connected in Part 3.",
      ""
    );
  });

  $("clear-pdf-btn")?.addEventListener("click", () => {
    if ($("pdf-input")) $("pdf-input").value = "";
    if ($("pdf-result")) $("pdf-result").value = "";
    if ($("pdf-status")) $("pdf-status").textContent = "Choose a PDF to begin.";
    if ($("pdf-progress-bar")) $("pdf-progress-bar").style.width = "0%";

    hideNotice("pdf-notice");
  });

  $("copy-pdf-btn")?.addEventListener("click", () => {
    copyText($("pdf-result")?.value || "", "pdf-notice");
  });

  $("download-pdf-text-btn")?.addEventListener("click", () => {
    downloadText($("pdf-result")?.value || "", "naol-pdf-text.txt", "pdf-notice");
  });

  // ------------------------------
  // 9. TRANSLATION CONTROLS
  // Full translation logic is added in Part 3.
  // ------------------------------

  $("swap-languages-btn")?.addEventListener("click", () => {
    const sourceLanguage = $("source-language");
    const targetLanguage = $("target-language");
    const sourceText = $("source-text");
    const translatedText = $("translated-text");

    if (!sourceLanguage || !targetLanguage) return;

    const previousLanguage = sourceLanguage.value;
    sourceLanguage.value = targetLanguage.value;
    targetLanguage.value = previousLanguage;

    const previousText = sourceText.value;
    sourceText.value = translatedText.value;
    translatedText.value = previousText;
  });

  $("clear-source-btn")?.addEventListener("click", () => {
    $("source-text").value = "";
    $("translated-text").value = "";
    hideNotice("translation-status");
  });

  $("paste-source-btn")?.addEventListener("click", async () => {
    try {
      $("source-text").value = await navigator.clipboard.readText();
      showNotice("translation-status", "Text pasted successfully.", "success");
    } catch (_) {
      showNotice(
        "translation-status",
        "Your browser blocked clipboard access. Paste your text manually.",
        "error"
      );
    }
  });

  $("translate-btn")?.addEventListener("click", () => {
    showNotice(
      "translation-status",
      "Translation engine will be connected in Part 3.",
      ""
    );
  });

  $("copy-translation-btn")?.addEventListener("click", () => {
    copyText($("translated-text")?.value || "", "translation-status");
  });

  $("use-translation-btn")?.addEventListener("click", () => {
    const translated = $("translated-text")?.value || "";

    if (!translated.trim()) {
      showNotice("translation-status", "Translate some text first.", "error");
      return;
    }

    $("handwriting-input").value = translated;
    showView("handwriting-view");
    renderHandwriting();
  });

  // ------------------------------
  // 10. HANDWRITING PREVIEW
  // ------------------------------

  function renderHandwriting() {
    const input = $("handwriting-input");
    const preview = $("handwriting-preview");
    const fontSelect = $("handwriting-font");
    const sizeSelect = $("handwriting-size");
    const watermarkInput = $("handwriting-watermark");

    if (!input || !preview) return;

    const text = input.value.trim();

    preview.textContent = text || "Your handwriting preview will appear here.";

    preview.style.fontFamily = fontSelect?.value === "Caveat"
      ? "Caveat, cursive"
      : fontSelect?.value || "Caveat, cursive";

    preview.style.fontSize = `${Number(sizeSelect?.value || 28)}px`;

    const watermark = watermarkInput?.value.trim();

    preview.style.backgroundImage = watermark
      ? "repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(70,90,130,.12) 40px)"
      : "none";
  }

  $("render-handwriting-btn")?.addEventListener("click", () => {
    renderHandwriting();
    showNotice("handwriting-notice", "Preview updated.", "success");
  });

  $("handwriting-input")?.addEventListener("input", renderHandwriting);
  $("handwriting-font")?.addEventListener("change", renderHandwriting);
  $("handwriting-size")?.addEventListener("change", renderHandwriting);

  // ------------------------------
  // 11. EXPORT PLACEHOLDERS
  // Full export logic is added in Part 3.
  // ------------------------------

  function exportNotReady() {
    showNotice(
      "handwriting-notice",
      "Export tools will be activated in Part 3.",
      ""
    );
  }

  $("download-handwriting-png-btn")?.addEventListener("click", exportNotReady);
  $("download-handwriting-jpg-btn")?.addEventListener("click", exportNotReady);
  $("download-handwriting-pdf-btn")?.addEventListener("click", exportNotReady);

  // ------------------------------
  // 12. INITIAL STATE
  // ------------------------------

  showView("ocr-view");
  renderHandwriting();

  console.log("Naol Converter Part 2 loaded.");
});

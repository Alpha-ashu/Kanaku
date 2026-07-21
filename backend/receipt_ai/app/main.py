from __future__ import annotations

import io
import os
import re
from typing import Any, Dict, List, Tuple

import torch
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image
from transformers import DonutProcessor, VisionEncoderDecoderModel

MODEL_ID = os.getenv("DONUT_MODEL_ID", "naver-clova-ix/donut-base-finetuned-cord-v2")
API_KEY = os.getenv("RECEIPT_OCR_API_KEY")
PADDLE_LANG = os.getenv("PADDLE_OCR_LANG", "en")
TASK_PROMPT = "<s_cord-v2>"

app = FastAPI(title="Receipt OCR Service", version="1.1.0")

processor = DonutProcessor.from_pretrained(MODEL_ID)
model = VisionEncoderDecoderModel.from_pretrained(MODEL_ID)
model.eval()

if torch.cuda.is_available():
    model.to("cuda")

# ── PaddleOCR (lazy) ─────────────────────────────────────────────────────────
# Loaded on first /ocr call, not at import, so a Donut-only deployment (or an
# image without paddlepaddle installed) still boots and serves /scan-receipt.
# PaddleOCR gives per-line bounding boxes + confidence — markedly more accurate
# than Tesseract on columnar receipts/statements, and the boxes let us rebuild
# the row layout so a table never collapses into a merged garbage string.
_paddle_ocr = None
_paddle_error: str | None = None


def _get_paddle():
    global _paddle_ocr, _paddle_error
    if _paddle_ocr is not None:
        return _paddle_ocr
    if _paddle_error is not None:
        raise HTTPException(status_code=503, detail=_paddle_error)
    try:
        from paddleocr import PaddleOCR  # heavy import — deferred on purpose

        _paddle_ocr = PaddleOCR(use_angle_cls=True, lang=PADDLE_LANG, show_log=False)
        return _paddle_ocr
    except Exception as exc:  # noqa: BLE001
        _paddle_error = f"PaddleOCR unavailable: {exc}"
        raise HTTPException(status_code=503, detail=_paddle_error) from exc


def _reconstruct_layout(lines: List[Tuple[Any, str, float]]) -> str:
    """Group detected text lines into visual rows (by vertical overlap), order
    each row left-to-right, and join — preserving the table structure that a
    flat OCR text stream loses. `lines` is a list of (quad_box, text, conf)."""
    items = []
    for box, text, _conf in lines:
        ys = [float(p[1]) for p in box]
        xs = [float(p[0]) for p in box]
        items.append(
            {
                "text": text,
                "cy": sum(ys) / len(ys),
                "left": min(xs),
                "height": max(ys) - min(ys),
            }
        )
    items.sort(key=lambda i: i["cy"])

    rows: List[Dict[str, Any]] = []
    for it in items:
        placed = False
        for row in rows:
            # same row when vertical centres sit within half a line-height
            if abs(row["cy"] - it["cy"]) <= max(it["height"], row["h"]) * 0.5:
                row["items"].append(it)
                row["cy"] = (row["cy"] * row["n"] + it["cy"]) / (row["n"] + 1)
                row["n"] += 1
                row["h"] = max(row["h"], it["height"])
                placed = True
                break
        if not placed:
            rows.append({"cy": it["cy"], "n": 1, "h": it["height"], "items": [it]})

    out_lines = []
    for row in rows:
        row["items"].sort(key=lambda i: i["left"])
        out_lines.append("  ".join(i["text"] for i in row["items"]))
    return "\n".join(out_lines)


def _parse_amount(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = re.sub(r"[^\d.-]", "", value)
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _normalize_result(payload: Dict[str, Any]) -> Dict[str, Any]:
    total = (
        _parse_amount(payload.get("total"))
        or _parse_amount(payload.get("total_amount"))
        or _parse_amount(payload.get("amount"))
        or _parse_amount(payload.get("grand_total"))
        or _parse_amount(payload.get("food_total"))
    )

    merchant = (
        payload.get("vendor")
        or payload.get("merchant")
        or payload.get("merchant_name")
        or payload.get("store_name")
        or payload.get("nm")
    )

    date = payload.get("date") or payload.get("transaction_date") or payload.get("purchase_date")

    return {
        "merchantName": merchant,
        "amount": total,
        "date": date,
        "currency": payload.get("currency") or payload.get("currency_code") or "INR",
    }


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "ok", "model": MODEL_ID, "paddleReady": _paddle_ocr is not None}


@app.post("/ocr")
async def ocr_text(
    file: UploadFile = File(...),
    x_api_key: str | None = Header(default=None),
) -> Dict[str, Any]:
    """Raw layout-aware OCR via PaddleOCR. Returns row-reconstructed text plus
    per-line text/confidence. The Node backend feeds `text` to the LLM (or the
    heuristic parser when the LLM is unavailable) — same contract Tesseract fed,
    but with the table structure preserved."""
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid OCR API key")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty upload")

    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid image") from exc

    import numpy as np

    ocr = _get_paddle()
    try:
        result = ocr.ocr(np.array(image), cls=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"PaddleOCR failed: {exc}") from exc

    # result shape (PaddleOCR 2.x): [ [ [box, (text, conf)], ... ] ] per image;
    # a blank page yields [None]. Parse defensively.
    page = result[0] if result else None
    lines: List[Tuple[Any, str, float]] = []
    for entry in (page or []):
        try:
            box = entry[0]
            text, conf = entry[1][0], float(entry[1][1])
            text = str(text).strip()
            if text:
                lines.append((box, text, conf))
        except Exception:  # noqa: BLE001 — skip malformed detections
            continue

    reconstructed = _reconstruct_layout(lines)
    confidences = [c for _, _, c in lines]

    return {
        "text": reconstructed,
        "lines": [{"text": t, "confidence": round(c, 4)} for _, t, c in lines],
        "lineCount": len(lines),
        "avgConfidence": round(sum(confidences) / len(confidences), 4) if confidences else 0.0,
        "engine": "paddleocr",
    }


@app.post("/scan-receipt")
async def scan_receipt(
    file: UploadFile = File(...),
    x_api_key: str | None = Header(default=None),
) -> Dict[str, Any]:
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid OCR API key")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty upload")

    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid image") from exc

    pixel_values = processor(image, return_tensors="pt").pixel_values
    if torch.cuda.is_available():
        pixel_values = pixel_values.to("cuda")

    decoder_input_ids = processor.tokenizer(
        TASK_PROMPT,
        add_special_tokens=False,
        return_tensors="pt",
    ).input_ids

    if torch.cuda.is_available():
        decoder_input_ids = decoder_input_ids.to("cuda")

    with torch.inference_mode():
        outputs = model.generate(
            pixel_values,
            decoder_input_ids=decoder_input_ids,
            max_length=model.config.decoder.max_position_embeddings,
            pad_token_id=processor.tokenizer.pad_token_id,
            eos_token_id=processor.tokenizer.eos_token_id,
            use_cache=True,
            bad_words_ids=[[processor.tokenizer.unk_token_id]],
            return_dict_in_generate=True,
        )

    sequence = outputs.sequences
    decoded = processor.batch_decode(sequence, skip_special_tokens=True)[0]
    parsed = processor.token2json(decoded)

    normalized = _normalize_result(parsed)

    return {
        **parsed,
        **normalized,
        "requiresConfirmation": True,
    }

"""
Meesho AI Listing Generator - Backend Server
Run: python server.py
Requires: pip install flask flask-cors openai pillow
"""

import os
import json
import base64
from flask import Flask, request, jsonify
from flask_cors import CORS

# ── Optional: load .env if present ──────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ── OpenAI client setup ──────────────────────────────────────────────────────
try:
    from openai import OpenAI
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
    AI_AVAILABLE = True
except ImportError:
    AI_AVAILABLE = False
    print("⚠️  openai package not installed. Run: pip install openai")

app = Flask(__name__)
CORS(app, origins=["chrome-extension://*", "http://localhost:*"])

# ── Field schema returned to the extension ──────────────────────────────────
FIELD_SCHEMA = {
    "product_name": "",
    "color": "",
    "meesho_price": "",
    "product_mrp": "",
    "only_wrong_return_price": "",
    "inventory": "",
    "supplier_gst_percent": "",
    "hsn_code": "",
    "product_weight_in_gms": "",
    "supplier_product_id": "",
    "category": "",
    "brand": "",
    "description": ""
}

TEXT_SYSTEM_PROMPT = """
You are a Meesho product listing expert. Given a product description, extract and generate structured listing fields.

Return ONLY a valid JSON object with these exact keys (use empty string "" if unknown):
{
  "product_name": "Full product name (max 100 chars)",
  "color": "Primary color(s) of the product",
  "meesho_price": "Selling price in INR (numbers only, no ₹ symbol)",
  "product_mrp": "MRP in INR (numbers only)",
  "only_wrong_return_price": "Wrong return price in INR (usually 0 or same as meesho_price)",
  "inventory": "Stock quantity (number only)",
  "supplier_gst_percent": "GST percentage (e.g. 5, 12, 18 — number only)",
  "hsn_code": "HSN code for the product category",
  "product_weight_in_gms": "Product weight in grams (number only)",
  "supplier_product_id": "A short unique SKU/product ID (e.g. SKU-001)",
  "category": "Meesho product category",
  "brand": "Brand name if mentioned, else empty string",
  "description": "A compelling 2-3 sentence product description for buyers"
}

Rules:
- All price/number fields must contain ONLY digits (no currency symbols, no units)
- If GST is not mentioned, infer from product type (clothing=5%, electronics=18%, etc.)
- If HSN is not mentioned, infer from product category
- If weight is not mentioned, estimate based on product type
- Return ONLY the JSON object, no markdown, no explanation
""".strip()

IMAGE_SYSTEM_PROMPT = """
You are a Meesho product listing expert. Analyze the product image and generate a complete listing.
Return a detailed text description of the product including: name, color, material, style, use case, and suggested price range.
""".strip()


@app.route("/generate-from-text", methods=["POST"])
def generate_from_text():
    """
    Accepts: { "description": "product description text" }
    Returns: { "success": true, "fields": { ...field_key: value... } }
    """
    try:
        body = request.get_json()
        if not body or not body.get("description"):
            return jsonify({"success": False, "error": "Missing 'description' in request body"}), 400

        description = body["description"].strip()

        if not AI_AVAILABLE:
            return jsonify({"success": False, "error": "OpenAI package not installed on server"}), 500

        if not client.api_key:
            return jsonify({"success": False, "error": "OPENAI_API_KEY not set on server"}), 500

        # Call OpenAI
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": TEXT_SYSTEM_PROMPT},
                {"role": "user",   "content": f"Product description: {description}"}
            ],
            temperature=0.3,
            max_tokens=600
        )

        raw = response.choices[0].message.content.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        fields = json.loads(raw)

        # Ensure all expected keys exist
        result = {k: str(fields.get(k, "")).strip() for k in FIELD_SCHEMA}

        return jsonify({"success": True, "fields": result})

    except json.JSONDecodeError as e:
        return jsonify({"success": False, "error": f"AI returned invalid JSON: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/generate", methods=["POST"])
def generate_from_image():
    """
    Accepts: multipart/form-data with 'image' file
    Returns: { "success": true, "result": "text description" }
    """
    try:
        if "image" not in request.files:
            return jsonify({"success": False, "error": "No image file provided"}), 400

        image_file = request.files["image"]
        image_bytes = image_file.read()
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        mime_type = image_file.content_type or "image/jpeg"

        if not AI_AVAILABLE:
            return jsonify({"success": False, "error": "OpenAI package not installed on server"}), 500

        if not client.api_key:
            return jsonify({"success": False, "error": "OPENAI_API_KEY not set on server"}), 500

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": IMAGE_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{image_b64}"
                            }
                        },
                        {
                            "type": "text",
                            "text": "Analyze this product image and generate a complete Meesho listing description."
                        }
                    ]
                }
            ],
            temperature=0.4,
            max_tokens=800
        )

        result_text = response.choices[0].message.content.strip()
        return jsonify({"success": True, "result": result_text})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "ai_available": AI_AVAILABLE})


if __name__ == "__main__":
    print("🚀 Meesho AI Listing Server running at http://localhost:5001")
    print("   Endpoints:")
    print("   POST /generate           — Generate listing from image")
    print("   POST /generate-from-text — Generate listing from text description")
    print("   GET  /health             — Health check")
    app.run(host="0.0.0.0", port=5001, debug=True)

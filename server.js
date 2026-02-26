/**
 * Meesho AI Listing Generator - Node.js Backend Server
 * Run: node server.js
 * Requires: npm install express cors openai dotenv
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');

// ── OpenAI setup ─────────────────────────────────────────────────────────────
let openai = null;
try {
  const { OpenAI } = require('openai');
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
} catch (e) {
  console.error('❌ openai package not found. Run: npm install openai');
}

const app  = express();
const PORT = process.env.PORT || 5001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Optional Access Token Protection ─────────────────────────────────────────
// Set ACCESS_TOKEN env var on Railway to protect your API from unauthorized use
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || '';
app.use((req, res, next) => {
  if (!ACCESS_TOKEN) return next(); // No token set = open access (localhost dev)
  if (req.path === '/health') return next(); // Health check always allowed
  const token = req.headers['x-access-token'] || req.query.token;
  if (token !== ACCESS_TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Invalid access token.' });
  }
  next();
});

// Multer for image uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// ── Prompts ───────────────────────────────────────────────────────────────────
const TEXT_SYSTEM_PROMPT = `
You are a Meesho product listing expert. Given a product description, extract and generate structured listing fields.

Return ONLY a valid JSON object with these exact keys (use empty string "" if unknown):
{
  "product_name": "Full product name (max 100 chars)",
  "color": "Primary color(s) of the product",
  "meesho_price": "Selling price in INR (numbers only, no ₹ symbol)",
  "product_mrp": "MRP in INR (numbers only)",
  "only_wrong_return_price": "Wrong return price in INR (usually 0)",
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
- If GST is not mentioned, infer from product type (clothing=5%, electronics=18%, home=12%)
- If HSN is not mentioned, infer from product category
- If weight is not mentioned, estimate based on product type
- Return ONLY the JSON object, no markdown, no explanation
`.trim();

const IMAGE_SYSTEM_PROMPT = `
You are a Meesho product listing expert. Analyze the product image and generate a complete listing description.
Return a detailed text description including: product name, color, material, style, use case, and suggested price range.
`.trim();

const FIELD_KEYS = [
  'product_name', 'color', 'meesho_price', 'product_mrp',
  'only_wrong_return_price', 'inventory', 'supplier_gst_percent',
  'hsn_code', 'product_weight_in_gms', 'supplier_product_id',
  'category', 'brand', 'description'
];

// ── POST /generate-from-text ──────────────────────────────────────────────────
app.post('/generate-from-text', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, error: "Missing 'description' in request body" });
    }

    if (!openai) {
      return res.status(500).json({ success: false, error: 'OpenAI package not available' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ success: false, error: 'OPENAI_API_KEY not set. Create a .env file with OPENAI_API_KEY=sk-...' });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: TEXT_SYSTEM_PROMPT },
        { role: 'user',   content: `Product description: ${description.trim()}` }
      ],
      temperature: 0.3,
      max_tokens: 600
    });

    let raw = response.choices[0].message.content.trim();

    // Strip markdown code fences if present
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    const parsed = JSON.parse(raw);

    // Ensure all expected keys exist as strings
    const fields = {};
    for (const key of FIELD_KEYS) {
      fields[key] = String(parsed[key] || '').trim();
    }

    return res.json({ success: true, fields });

  } catch (err) {
    console.error('❌ /generate-from-text error:', err.message);
    if (err instanceof SyntaxError) {
      return res.status(500).json({ success: false, error: 'AI returned invalid JSON. Try again.' });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /generate (image) ────────────────────────────────────────────────────
app.post('/generate', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    if (!openai) {
      return res.status(500).json({ success: false, error: 'OpenAI package not available' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ success: false, error: 'OPENAI_API_KEY not set' });
    }

    const imageB64  = req.file.buffer.toString('base64');
    const mimeType  = req.file.mimetype || 'image/jpeg';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: IMAGE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageB64}` }
            },
            {
              type: 'text',
              text: 'Analyze this product image and generate a complete Meesho listing description.'
            }
          ]
        }
      ],
      temperature: 0.4,
      max_tokens: 800
    });

    const result = response.choices[0].message.content.trim();
    return res.json({ success: true, result });

  } catch (err) {
    console.error('❌ /generate error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Length enforcement helpers ────────────────────────────────────────────────

/**
 * Pads or truncates product_name to exactly `targetLen` characters.
 * Padding uses comma-separated SEO keywords.
 */
function enforceProductNameLength(name, targetLen = 300) {
  if (!name) return name;
  if (name.length >= targetLen) return name.substring(0, targetLen);
  const keywords = [
    'Durable Quality', 'Long Lasting', 'Easy to Use', 'Lightweight Design',
    'Compact Size', 'Multi Purpose', 'Versatile Product', 'Modern Style',
    'Attractive Look', 'Great Value', 'Functional Design', 'Practical Use',
    'Quality Material', 'Reliable Product', 'Stylish Finish', 'Smooth Texture',
    'Sturdy Build', 'Eco Friendly', 'Washable Material', 'Reusable Design'
  ];
  let padded = name;
  for (const kw of keywords) {
    if (padded.length >= targetLen) break;
    const addition = ', ' + kw;
    if (padded.length + addition.length <= targetLen) {
      padded += addition;
    } else {
      const remaining = targetLen - padded.length;
      if (remaining > 3) padded += addition.substring(0, remaining);
      break;
    }
  }
  // Final pad with spaces if still short
  while (padded.length < targetLen) padded += ' ';
  return padded.substring(0, targetLen);
}

/**
 * Pads or truncates description to exactly `targetLen` characters.
 * Padding uses generic SEO-friendly product sentences with rich keywords.
 */
function enforceDescriptionLength(desc, targetLen = 1400) {
  if (!desc) return desc;
  if (desc.length >= targetLen) return desc.substring(0, targetLen);
  const additions = [
    ' This product is crafted with attention to detail, ensuring durability and long-lasting performance for daily use.',
    ' The ergonomic design ensures comfortable handling and ease of use for all users across different age groups.',
    ' Made from high-quality materials, this product meets strict quality standards and delivers consistent results.',
    ' The compact and lightweight design makes it easy to store and carry, perfect for travel and outdoor use.',
    ' Easy to clean and maintain, ensuring hygiene and longevity of the product with minimal effort required.',
    ' Available in attractive designs, this product enhances the visual appeal of any space it is placed in.',
    ' A reliable and affordable choice for those seeking quality, value, and functionality in a single product.',
    ' Suitable for gifting on occasions like birthdays, anniversaries, and festivals, making it a thoughtful choice.',
    ' The product undergoes rigorous quality checks to ensure it meets the highest standards before reaching customers.',
    ' Order now and experience the perfect blend of style, functionality, and durability in this exceptional product.',
    ' Ideal for indoor and outdoor use, this versatile product adapts to a wide range of settings and requirements.',
    ' The smooth finish and polished look make it an attractive addition to any collection or living space.',
    ' Designed for long-term use, this product resists wear and tear, maintaining its original quality over time.',
    ' A must-have product for modern households, combining practicality with an elegant and contemporary aesthetic.',
    ' The thoughtful construction ensures that every component works seamlessly together for optimal performance.',
    ' Trusted by thousands of satisfied customers, this product has earned a reputation for reliability and value.',
    ' Whether used professionally or casually, this product delivers consistent, high-quality results every time.',
    ' The innovative design incorporates user feedback to provide an improved and more intuitive experience.',
    ' Packaged securely to prevent damage during transit, ensuring the product arrives in perfect condition.',
    ' This product is an excellent value-for-money option, offering features typically found in higher-priced alternatives.',
    ' Crafted using eco-conscious manufacturing processes, this product is a responsible choice for mindful shoppers.',
    ' The non-toxic, food-grade, and skin-safe materials make it suitable for use by children and adults alike.',
    ' With its multi-functional design, this product eliminates the need for multiple separate items, saving space and cost.',
    ' The rust-proof, waterproof, and stain-resistant surface ensures the product remains pristine even after extended use.',
    ' Lightweight yet sturdy, this product strikes the perfect balance between portability and structural integrity.',
    ' Designed to meet Indian household needs, this product is tailored for local preferences and usage patterns.',
    ' The vibrant color options and modern patterns make this product a stylish and eye-catching choice.',
    ' Backed by a quality assurance process, every unit is inspected before dispatch to ensure customer satisfaction.',
    ' This product makes an ideal return gift, corporate gift, or festive hamper addition for all occasions.',
    ' The wide compatibility and universal design ensure this product works seamlessly across various use cases.',
  ];
  let padded = desc;
  for (const addition of additions) {
    if (padded.length >= targetLen) break;
    if (padded.length + addition.length <= targetLen) {
      padded += addition;
    } else {
      const remaining = targetLen - padded.length;
      if (remaining > 10) padded += addition.substring(0, remaining);
      break;
    }
  }
  // Final pad with spaces if still short
  while (padded.length < targetLen) padded += ' ';
  return padded.substring(0, targetLen);
}

// ── POST /generate-from-form (scan-aware) ────────────────────────────────────
app.post('/generate-from-form', async (req, res) => {
  try {
    const { description, formFields } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, error: "Missing 'description' in request body" });
    }
    if (!formFields || !Array.isArray(formFields) || formFields.length === 0) {
      return res.status(400).json({ success: false, error: "Missing 'formFields' array in request body" });
    }
    if (!openai) {
      return res.status(500).json({ success: false, error: 'OpenAI package not available' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ success: false, error: 'OPENAI_API_KEY not set. Create a .env file with OPENAI_API_KEY=sk-...' });
    }

    // Build a field list for the prompt using the actual scanned fields
    const fieldList = formFields.map(f =>
      `- Selector: "${f.selector}" | Label: "${f.label}" | Type: ${f.type}${f.id ? ' | ID: ' + f.id : ''}`
    ).join('\n');

    const prompt = `You are a Meesho product listing expert. Generate accurate, SEO-rich listing data for the product described below.

The Meesho listing form has these fields (use EXACT selectors):
${fieldList}

Product description: "${description.trim()}"

━━━━━━━━━━━━━━━━━━━━━━
FIXED VALUES — always use these exact values for matching fields:
- Inventory / Stock: 100
- Variation / Size: Free Size
- Country of Origin: India
- Manufacturer Name: PURVANCHAL
- Manufacturer Address: DAWARPAR, GORAKHPUR, UTTARPRADESH
- Manufacturer Pincode: 273016
- Packer Name: PURVANCHAL
- Packer Address: DAWARPAR, GORAKHPUR, UTTARPRADESH
- Packer Pincode: 273016
- Importer Name: PURVANCHAL
- Importer Address: DAWARPAR, GORAKHPUR, UTTARPRADESH
- Importer Pincode: 273016
- Group ID: GROUP 1
- Brand Name: (DO NOT fill — leave blank, skip this field entirely)

━━━━━━━━━━━━━━━━━━━━━━
GENERATION RULES:

Product Name:
- SEO-rich marketplace title, EXACTLY 300 characters (use the FULL 300 character limit — pad with additional keywords, colors, use-cases, materials if needed)
- Include: Product Type + Material + Key Specs + Use-case + Color + Target Audience + Key Features
- NO brand names
- NO non-compliance words: you, everyday, home, homes, house, premium, safe, guaranteed, best, top
- Include high-intent SEO keywords, synonyms, and related search terms to fill all 300 characters

SKU ID: ST-<ProductType>-001 (e.g. ST-Kurti-001, ST-Dispenser-001)

HSN Code: Infer from product category (e.g. clothing=6211, kitchenware=7323, plastic items=3924)

GST: Always use 5 (number only, no % symbol — fixed value for all products)

Price (Meesho Price): Realistic market price in INR, digits only, no ₹ symbol

Weight: Realistic weight in grams, digits only

Packaging Dimensions: Realistic values based on product type and size

Product Dimensions: Realistic values based on product type and size

Description: EXACTLY 1400 characters (use the FULL 1400 character limit). Write a detailed, SEO-rich product description that includes:
- Product name and type
- Material and build quality
- Key features and specifications (at least 7-10 bullet-style points written as sentences)
- Usage scenarios and benefits
- Dimensions, capacity, or size details
- Care instructions or usage tips
- Target audience (women, men, kids, kitchen, office, travel, gifting, etc.)
- 40+ high-intent SEO keywords naturally woven in, covering:
    * Product type synonyms and alternate names
    * Material keywords (e.g. stainless steel, BPA-free plastic, pure cotton, polyester, ceramic)
    * Color and finish keywords (e.g. multicolor, printed, solid, matte, glossy)
    * Use-case keywords (e.g. kitchen use, office use, travel friendly, outdoor, gifting, festive)
    * Audience keywords (e.g. women, men, girls, boys, kids, adults, family)
    * Quality keywords (e.g. durable, long-lasting, sturdy, lightweight, rust-proof, waterproof, washable)
    * Shopping intent keywords (e.g. buy online, affordable, value for money, budget friendly, under 500)
    * Occasion keywords (e.g. birthday gift, anniversary gift, wedding gift, Diwali, Holi, Raksha Bandhan)
    * Trending marketplace search terms relevant to the product category
- NO brand names. NO non-compliance words (you, everyday, home, homes, house, premium, safe, guaranteed, best, top).
- Must be exactly 1400 characters — count carefully and pad with additional keyword-rich sentences if needed.

For dropdown fields (type=select or type=dropdown): provide the most common valid option value that would appear in a Meesho dropdown (e.g. for Material: "Plastic", "Stainless Steel", "Cotton"; for Generic Name: the product type; for Net Quantity: "1"; for Packaging Unit: "cm" or "inch")

━━━━━━━━━━━━━━━━━━━━━━
Return ONLY a valid JSON array (no markdown, no explanation, no code fences):
[
  { "selector": "exact_selector_from_above", "value": "generated_value" }
]

IMPORTANT:
- Use the EXACT selector strings from the field list above
- Do NOT include Brand Name field in output
- Do NOT include fields with empty or null values
- For number-only fields: digits only, no symbols or units`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2500
    });

    let raw = response.choices[0].message.content.trim();
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return res.status(500).json({ success: false, error: 'AI returned invalid JSON. Try again.' });
    }

    if (!Array.isArray(parsed)) {
      return res.status(500).json({ success: false, error: 'AI returned unexpected format. Try again.' });
    }

    // Filter out entries without selector or value
    let fields = parsed.filter(f => f && f.selector && f.value !== undefined && String(f.value).trim() !== '');

    // ── Enforce exact character lengths for product_name and description ──────
    fields = fields.map(f => {
      const sel = String(f.selector || '');
      const lbl = String(f.label || '').toLowerCase();
      let val = String(f.value || '');

      // Product Name → exactly 300 chars
      if (sel.includes('product_name') || lbl.includes('product name')) {
        val = enforceProductNameLength(val, 300);
      }

      // Description textarea → exactly 1400 chars
      if (
        sel.toLowerCase().includes('description') ||
        lbl.includes('description') ||
        sel.toLowerCase().includes('textarea')
      ) {
        val = enforceDescriptionLength(val, 1400);
      }

      return { ...f, value: val };
    });

    // ── Enforce price rules: wrong_return = price-1, mrp = price×4 ───────────
    const priceField = fields.find(f =>
      String(f.selector).includes('meesho_price') ||
      String(f.label || '').toLowerCase().includes('meesho price')
    );
    if (priceField) {
      const price = parseInt(String(priceField.value), 10);
      if (!isNaN(price) && price > 0) {
        const wrongReturnSel = 'input[id="only_wrong_return_price"]';
        const mrpSel = 'input[id="product_mrp"]';

        // Wrong/Defective Returns Price = Meesho Price - 1
        const wrongIdx = fields.findIndex(f => String(f.selector).includes('only_wrong_return_price'));
        if (wrongIdx > -1) {
          fields[wrongIdx] = { ...fields[wrongIdx], value: String(price - 1) };
        } else {
          fields.push({ selector: wrongReturnSel, value: String(price - 1), label: 'Wrong/Defective Returns Price' });
        }

        // MRP = Meesho Price × 4
        const mrpIdx = fields.findIndex(f => String(f.selector).includes('product_mrp'));
        if (mrpIdx > -1) {
          fields[mrpIdx] = { ...fields[mrpIdx], value: String(price * 4) };
        } else {
          fields.push({ selector: mrpSel, value: String(price * 4), label: 'MRP' });
        }
      }
    }

    return res.json({ success: true, fields, count: fields.length });

  } catch (err) {
    console.error('❌ /generate-from-form error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /health ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    openai_key_set: !!process.env.OPENAI_API_KEY,
    port: PORT
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Meesho AI Listing Server running at http://0.0.0.0:${PORT}`);
  console.log('   Endpoints:');
  console.log(`   POST http://localhost:${PORT}/generate             — Generate from image`);
  console.log(`   POST http://localhost:${PORT}/generate-from-text   — Generate from text (hardcoded fields)`);
  console.log(`   POST http://localhost:${PORT}/generate-from-form   — Generate from scanned form fields`);
  console.log(`   GET  http://localhost:${PORT}/health               — Health check`);
  if (!process.env.OPENAI_API_KEY) {
    console.log('\n⚠️  OPENAI_API_KEY not set! Create a .env file:');
    console.log('   echo "OPENAI_API_KEY=sk-..." > .env');
  } else {
    console.log('\n✅ OpenAI API key detected.');
  }
  console.log('');
});

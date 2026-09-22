"""
Procurement Document Generator Web Application (Flask Backend)
Center for Special Education, Sukhothai Province (ศกศ.สท)
"""

import os
import sys
import json
from datetime import date, timedelta
from urllib.parse import quote
from flask import Flask, render_template, request, jsonify, send_file

# Add project root to sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(BASE_DIR)
if PARENT_DIR not in sys.path:
    sys.path.insert(0, PARENT_DIR)

from webapp.docx_generator import generate_procurement_doc
from webapp.bahttext import baht_text
from webapp.thai_calendar import (
    check_date,
    add_working_days,
    ensure_working_day,
    format_thai_date,
    parse_thai_date,
    is_weekend,
    get_holiday_name
)
from webapp.presets import DEPARTMENTS, STAFF_MEMBERS, OFFICERS, DEFAULT_VENDORS

app = Flask(__name__, template_folder=os.path.join(BASE_DIR, "templates"), static_folder=os.path.join(BASE_DIR, "static"))
app.config['JSON_AS_ASCII'] = False

DATA_DIR = os.path.join(BASE_DIR, "data")
VENDORS_FILE = os.path.join(DATA_DIR, "vendors.json")
DRAFTS_FILE = os.path.join(DATA_DIR, "drafts.json")
GEOGRAPHY_FILE = os.path.join(DATA_DIR, "thai_geography.json")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Initialize vendors file if not present
if not os.path.exists(VENDORS_FILE):
    with open(VENDORS_FILE, "w", encoding="utf-8") as f:
        json.dump(DEFAULT_VENDORS, f, ensure_ascii=False, indent=2)

# Initialize drafts file if not present
if not os.path.exists(DRAFTS_FILE):
    with open(DRAFTS_FILE, "w", encoding="utf-8") as f:
        json.dump([], f, ensure_ascii=False, indent=2)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/geography", methods=["GET"])
def api_geography():
    if os.path.exists(GEOGRAPHY_FILE):
        try:
            with open(GEOGRAPHY_FILE, "r", encoding="utf-8") as f:
                geo = json.load(f)
            return jsonify({"status": "success", "data": geo})
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500
    return jsonify({"status": "error", "message": "Geography data not found"}), 404

@app.route("/api/presets", methods=["GET"])
def get_presets():
    # Load vendors from storage
    vendors = DEFAULT_VENDORS
    if os.path.exists(VENDORS_FILE):
        try:
            with open(VENDORS_FILE, "r", encoding="utf-8") as f:
                vendors = json.load(f)
        except Exception:
            vendors = DEFAULT_VENDORS

    today = date.today()
    today_status = check_date(today)
    
    return jsonify({
        "status": "success",
        "data": {
            "departments": DEPARTMENTS,
            "staff_members": STAFF_MEMBERS,
            "officers": OFFICERS,
            "vendors": vendors,
            "today": {
                "iso": today.isoformat(),
                "thai": format_thai_date(today),
                "status": today_status
            }
        }
    })

@app.route("/api/check-date", methods=["POST"])
def api_check_date():
    req = request.get_json() or {}
    date_str = req.get("date", "")
    parsed = parse_thai_date(date_str)
    if not parsed:
        return jsonify({"status": "error", "message": "Invalid date format"}), 400
    info = check_date(parsed)
    return jsonify({"status": "success", "data": info})

@app.route("/api/calculate-dates", methods=["POST"])
def api_calculate_dates():
    """
    Calculates procurement working dates skipping weekends and Thai holidays.
    Supports calc_type:
    - 'from_doc1' (default): starts from doc1_date, derives doc2_date and po_date (+1 working day)
    - 'from_po' / 'from_doc2': starts from po_date, calculates delivery_due_date and downstream
    """
    req = request.get_json() or {}
    calc_type = req.get("calc_type", "from_doc1")
    start_str = req.get("start_date", "")
    days = int(req.get("delivery_days", 5))
    
    start = parse_thai_date(start_str) or date.today()
    
    if calc_type in ["from_po", "from_doc2"]:
        po_dt = start
        if days <= 1:
            due_dt = po_dt
        else:
            due_dt = po_dt + timedelta(days=days)
        actual_dt = due_dt
        doc3_dt = add_working_days(actual_dt, 2)
        
        return jsonify({
            "status": "success",
            "data": {
                "po_date": format_thai_date(po_dt),
                "po_status": check_date(po_dt),
                "delivery_due_date": format_thai_date(due_dt),
                "delivery_due_status": check_date(due_dt),
                "delivery_actual_date": format_thai_date(actual_dt),
                "delivery_actual_status": check_date(actual_dt),
                "doc3_date": format_thai_date(doc3_dt),
                "doc3_status": check_date(doc3_dt),
            }
        })
    else:
        doc1_dt = start
        doc2_dt = add_working_days(doc1_dt, 1)
        po_dt = doc2_dt
        if days <= 1:
            due_dt = po_dt
        else:
            due_dt = po_dt + timedelta(days=days)
        actual_dt = due_dt
        doc3_dt = add_working_days(actual_dt, 2)
        
        return jsonify({
            "status": "success",
            "data": {
                "doc1_date": format_thai_date(doc1_dt),
                "doc1_status": check_date(doc1_dt),
                "doc2_date": format_thai_date(doc2_dt),
                "doc2_status": check_date(doc2_dt),
                "po_date": format_thai_date(po_dt),
                "po_status": check_date(po_dt),
                "delivery_due_date": format_thai_date(due_dt),
                "delivery_due_status": check_date(due_dt),
                "delivery_actual_date": format_thai_date(actual_dt),
                "delivery_actual_status": check_date(actual_dt),
                "doc3_date": format_thai_date(doc3_dt),
                "doc3_status": check_date(doc3_dt),
            }
        })

@app.route("/api/bahttext", methods=["POST"])
def api_bahttext():
    req = request.get_json() or {}
    number = req.get("number", 0)
    text = baht_text(number)
    return jsonify({"status": "success", "data": {"text": text}})

@app.route("/api/vendors", methods=["GET", "POST"])
def api_vendors():
    if request.method == "GET":
        with open(VENDORS_FILE, "r", encoding="utf-8") as f:
            vendors = json.load(f)
        return jsonify({"status": "success", "data": vendors})
        
    elif request.method == "POST":
        new_vendor = request.get_json() or {}
        if not new_vendor.get("name"):
            return jsonify({"status": "error", "message": "Vendor name required"}), 400
            
        with open(VENDORS_FILE, "r", encoding="utf-8") as f:
            vendors = json.load(f)
            
        # Update if existing, or append
        existing = False
        for i, v in enumerate(vendors):
            if v.get("name") == new_vendor.get("name"):
                vendors[i] = new_vendor
                existing = True
                break
        if not existing:
            new_vendor["id"] = f"v_{len(vendors)+1}"
            vendors.append(new_vendor)
            
        with open(VENDORS_FILE, "w", encoding="utf-8") as f:
            json.dump(vendors, f, ensure_ascii=False, indent=2)
            
        return jsonify({"status": "success", "data": vendors})

@app.route("/api/drafts", methods=["GET", "POST", "DELETE"])
def api_drafts():
    if request.method == "GET":
        with open(DRAFTS_FILE, "r", encoding="utf-8") as f:
            drafts = json.load(f)
        return jsonify({"status": "success", "data": drafts})
        
    elif request.method == "POST":
        draft_item = request.get_json() or {}
        with open(DRAFTS_FILE, "r", encoding="utf-8") as f:
            drafts = json.load(f)
            
        import time
        draft_id = draft_item.get("id") or f"draft_{int(time.time()*1000)}"
        draft_item["id"] = draft_id
        draft_item["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        
        # Replace if exists, else prepend
        found = False
        for i, d in enumerate(drafts):
            if d.get("id") == draft_id:
                drafts[i] = draft_item
                found = True
                break
        if not found:
            drafts.insert(0, draft_item)
            
        # Keep latest 50 drafts
        drafts = drafts[:50]
        with open(DRAFTS_FILE, "w", encoding="utf-8") as f:
            json.dump(drafts, f, ensure_ascii=False, indent=2)
            
        return jsonify({"status": "success", "data": {"id": draft_id}})
        
    elif request.method == "DELETE":
        draft_id = request.args.get("id")
        with open(DRAFTS_FILE, "r", encoding="utf-8") as f:
            drafts = json.load(f)
        drafts = [d for d in drafts if d.get("id") != draft_id]
        with open(DRAFTS_FILE, "w", encoding="utf-8") as f:
            json.dump(drafts, f, ensure_ascii=False, indent=2)
        return jsonify({"status": "success"})

@app.route("/api/export-docx", methods=["POST"])
def export_docx():
    try:
        data = request.get_json() or {}
        
        # Format filename: "เหตุผลความจำเป็น_ชื่อร้านค้า_มูลค่าสินค้า"
        reason = str(data.get("project_name", "ชุดเบิก")).strip() or "ชุดเบิก"
        vendor_info = data.get("vendor") or {}
        vendor_name = str(vendor_info.get("name") or data.get("vendor_name", "ร้านค้า")).strip() or "ร้านค้า"
        total = sum(float(item.get("total_price", 0)) for item in data.get("items", []))
        total_str = f"{int(total)}บาท" if total.is_integer() else f"{total:.2f}บาท"
        
        def sanitize_name(name: str) -> str:
            # Strip illegal filename characters: \ / : * ? " < > |
            cleaned = "".join(c for c in name if c not in '\\/:*?"<>|\r\n\t').strip()
            # Limit to 30 chars (Thai chars are 3 bytes, 30 chars = max 90 bytes) to stay under 255 bytes OS limit
            return cleaned[:30]
            
        safe_reason = sanitize_name(reason)
        safe_vendor = sanitize_name(vendor_name)
        filename = f"{safe_reason}_{safe_vendor}_{total_str}.docx"
        output_path = os.path.join(OUTPUT_DIR, filename)
        
        generate_procurement_doc(data, output_path)
        
        encoded_filename = quote(filename)
        response = send_file(
            output_path,
            as_attachment=True,
            download_name=filename,
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        response.headers["Content-Disposition"] = f"attachment; filename=\"{encoded_filename}\"; filename*=UTF-8''{encoded_filename}"
        return response
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"Starting Procurement Web App on {host}:{port} ...")
    
    # Open browser automatically only when running locally on Windows desktop
    if "RENDER" not in os.environ and "PORT" not in os.environ:
        import webbrowser
        def open_browser():
            import time
            time.sleep(1)
            webbrowser.open(f"http://localhost:{port}")
        import threading
        threading.Thread(target=open_browser, daemon=True).start()
    
    app.run(host=host, port=port, debug=False)

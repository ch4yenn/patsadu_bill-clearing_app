"""
ระบบสร้างชุดเบิกพัสดุ (ซื้อ / จ้าง) 6 หน้ามาตรฐาน
ศูนย์การศึกษาพิเศษ ประจำจังหวัดสุโขทัย
Main Entry Point Launcher for Local and Render
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from webapp.app import app

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    host = os.environ.get('HOST', '0.0.0.0')
    print(f'Starting Procurement Web App on {host}:{port} ...')
    
    # Auto-open browser only when running locally on Windows desktop
    if 'RENDER' not in os.environ and 'PORT' not in os.environ:
        import webbrowser
        import threading
        import time
        def open_browser():
            time.sleep(1)
            webbrowser.open(f'http://localhost:{port}')
        threading.Thread(target=open_browser, daemon=True).start()
        
    app.run(host=host, port=port, debug=False)

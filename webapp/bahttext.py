"""
Thai Baht Text converter for procurement system
Converts numbers into official Thai written form (e.g., 500.00 -> ห้าร้อยบาทถ้วน)
"""

def baht_text(number):
    if number is None:
        return ""
    if isinstance(number, str):
        number = number.replace(",", "").strip()
        if not number:
            return ""
    try:
        num = float(number)
    except (ValueError, TypeError):
        return ""
    
    if num == 0:
        return "ศูนย์บาทถ้วน"
        
    is_negative = num < 0
    num = abs(num)
    
    digits = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"]
    positions = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"]
    
    def convert_chunk(num_str):
        n = len(num_str)
        res = []
        for i, ch in enumerate(num_str):
            d = int(ch)
            pos = n - i - 1
            if d != 0:
                if pos == 0 and d == 1 and n > 1:
                    res.append("เอ็ด")
                elif pos == 1 and d == 2:
                    res.append("ยี่สิบ")
                elif pos == 1 and d == 1:
                    res.append("สิบ")
                else:
                    res.append(digits[d])
                    if pos > 0:
                        res.append(positions[pos])
        return "".join(res)

    s_num = f"{num:.2f}"
    baht_part, satang_part = s_num.split(".")
    
    baht_int = int(baht_part)
    satang_int = int(satang_part)
    
    baht_str = ""
    if baht_int > 0:
        s = str(baht_int)
        chunks = []
        while s:
            chunks.append(s[-6:])
            s = s[:-6]
        
        chunk_texts = []
        for i, ch in enumerate(chunks):
            txt = convert_chunk(ch)
            if i > 0 and txt:
                txt += "ล้าน" * i
            chunk_texts.append(txt)
        baht_str = "".join(reversed(chunk_texts)) + "บาท"
        
    satang_str = ""
    if satang_int == 0:
        satang_str = "ถ้วน"
    else:
        satang_str = convert_chunk(f"{satang_int:02d}") + "สตางค์"
        
    return ("ลบ" if is_negative else "") + baht_str + satang_str

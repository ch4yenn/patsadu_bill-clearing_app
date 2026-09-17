/**
 * Procurement Web Application Frontend
 * Center for Special Education, Sukhothai Province (ศกศ.สท)
 */

document.addEventListener('DOMContentLoaded', () => {
  // Global State
  let presets = null;
  let geoData = null;
  let currentVendors = [];
  let currentDrafts = [];
  let bahtDebounceTimer = null;
  let dateDebounceTimers = {};

  // DOM Elements
  const form = document.getElementById('procurementForm');
  const hireJobWrapper = document.getElementById('hireJobWrapper');
  const hireJobInput = document.getElementById('hire_job_name');
  const itemsTableBody = document.getElementById('itemsTableBody');
  const btnAddItem = document.getElementById('btnAddItem');
  const btnAutoCalcDates = document.getElementById('btnAutoCalcDates');
  const btnSaveCurrentVendor = document.getElementById('btnSaveCurrentVendor');
  const vendorSelect = document.getElementById('vendorSelect');
  const btnSaveDraft = document.getElementById('btnSaveDraft');
  const btnOpenDrafts = document.getElementById('btnOpenDrafts');
  const btnOpenVendors = document.getElementById('btnOpenVendors');
  const btnResetForm = document.getElementById('btnResetForm');
  const btnPreview = document.getElementById('btnPreview');
  const loadingOverlay = document.getElementById('loadingOverlay');

  // Modals
  const modalDrafts = document.getElementById('modalDrafts');
  const modalVendors = document.getElementById('modalVendors');
  const modalPreview = document.getElementById('modalPreview');

  // Summary Elements
  const dispGoodsValue = document.getElementById('dispGoodsValue');
  const rowVat = document.getElementById('rowVat');
  const dispVat = document.getElementById('dispVat');
  const dispTotalAmount = document.getElementById('dispTotalAmount');
  const rowWht = document.getElementById('rowWht');
  const dispWht = document.getElementById('dispWht');
  const rowFine = document.getElementById('rowFine');
  const dispFine = document.getElementById('dispFine');
  const dispNetPay = document.getElementById('dispNetPay');
  const dispBahtText = document.getElementById('dispBahtText');

  const hasVatCheckbox = document.getElementById('has_vat');
  const hasWhtCheckbox = document.getElementById('has_withholding_tax');
  const fineAmountInput = document.getElementById('fine_amount');

  // ----------------------------------------------------
  // Toast Notification System
  // ----------------------------------------------------
  function showToast(message, type = 'info', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';

    let icon = 'ℹ️';
    let borderColor = 'border-blue-400';
    if (type === 'success') {
      icon = '✅';
      borderColor = 'border-emerald-500';
    } else if (type === 'warning') {
      icon = '⚠️';
      borderColor = 'border-amber-500';
    } else if (type === 'error') {
      icon = '❌';
      borderColor = 'border-rose-500';
    }

    toast.classList.add(borderColor);
    toast.innerHTML = `
      <span class="text-lg">${icon}</span>
      <div class="text-sm font-medium text-slate-800 flex-grow">${message}</div>
      <button type="button" class="text-slate-400 hover:text-slate-600 text-base font-bold ml-2">&times;</button>
    `;

    toast.querySelector('button').addEventListener('click', () => {
      toast.remove();
    });

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ----------------------------------------------------
  // Init and Presets
  // ----------------------------------------------------
  async function loadPresets() {
    try {
      const res = await fetch('/api/presets');
      const json = await res.json();
      if (json.status === 'success') {
        presets = json.data;
        populatePresetsUI();
      }
    } catch (err) {
      console.error('Failed to load presets:', err);
      showToast('ไม่สามารถโหลดข้อมูลเริ่มต้นได้', 'error');
    }
  }

  function populatePresetsUI() {
    if (!presets) return;

    // 1. Departments datalist
    const deptList = document.getElementById('departmentList');
    deptList.innerHTML = '';
    presets.departments.forEach(dept => {
      const opt = document.createElement('option');
      opt.value = dept;
      deptList.appendChild(opt);
    });

    // 2. Staff dropdowns
    ['staffSelect1', 'staffSelect2', 'staffSelect3'].forEach((id, idx) => {
      const select = document.getElementById(id);
      select.innerHTML = '<option value="">เลือกบุคลากร...</option>';
      presets.staff_members.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.name;
        const unitStr = s.unit ? ` - ${s.unit}` : '';
        opt.textContent = `${s.name} (${s.position}${unitStr})`;
        opt.dataset.position = s.position;
        select.appendChild(opt);
      });

      select.addEventListener('change', (e) => {
        const selOpt = select.options[select.selectedIndex];
        if (selOpt && selOpt.value) {
          const num = idx + 1;
          document.getElementById(`c${num}_name`).value = selOpt.value;
          document.getElementById(`c${num}_pos`).value = selOpt.dataset.position || 'ครู';
        }
      });
    });

    // 3. Setup Staff Autocomplete Dropdown
    setupStaffAutocomplete();

    // 4. Vendors
    currentVendors = presets.vendors || [];
    renderVendorDropdown();

    // 5. Initial Today's Date if empty
    const doc1DateInput = document.getElementById('doc1_date');
    if (!doc1DateInput.value && presets.today) {
      doc1DateInput.value = presets.today.thai;
      validateDateField('doc1_date', presets.today.thai);
      // Auto-trigger date calculation once initially
      autoCalculateDates();
    }
  }

  function setupStaffAutocomplete() {
    const targets = [
      { inputId: 'c1_name', posId: 'c1_pos', sugId: 'c1_suggestions', selectId: 'staffSelect1' },
      { inputId: 'c2_name', posId: 'c2_pos', sugId: 'c2_suggestions', selectId: 'staffSelect2' },
      { inputId: 'c3_name', posId: 'c3_pos', sugId: 'c3_suggestions', selectId: 'staffSelect3' },
      { inputId: 'officer_supplies', posId: null, sugId: 'officer_supplies_suggestions', selectId: null },
      { inputId: 'head_supplies', posId: null, sugId: 'head_supplies_suggestions', selectId: null },
      { inputId: 'finance_officer', posId: null, sugId: 'finance_officer_suggestions', selectId: null }
    ];

    targets.forEach(t => {
      const nameInput = document.getElementById(t.inputId);
      const posInput = t.posId ? document.getElementById(t.posId) : null;
      const sugBox = document.getElementById(t.sugId);
      if (!nameInput || !sugBox) return;

      let activeIndex = -1;

      function closeSuggestions() {
        sugBox.classList.add('hidden');
        sugBox.innerHTML = '';
        activeIndex = -1;
      }

      function selectStaff(staff) {
        nameInput.value = staff.name;
        if (posInput) {
          posInput.value = staff.position || 'ครู';
        }
        closeSuggestions();
        if (t.selectId) {
          const quickSelect = document.getElementById(t.selectId);
          if (quickSelect) {
            quickSelect.value = staff.name;
          }
        }
      }

      function renderSuggestions(query) {
        if (!presets || !presets.staff_members) return;
        const q = query.trim().toLowerCase();
        if (!q) {
          closeSuggestions();
          return;
        }

        const matches = presets.staff_members.filter(s => {
          return (s.name && s.name.toLowerCase().includes(q)) ||
                 (s.position && s.position.toLowerCase().includes(q)) ||
                 (s.unit && s.unit.toLowerCase().includes(q));
        });

        if (matches.length === 0) {
          sugBox.innerHTML = `
            <div class="px-3 py-2.5 text-xs text-slate-400 text-center">
              ไม่พบรายชื่อที่มีคำว่า "${escapeHtml(q)}"
            </div>
          `;
          sugBox.classList.remove('hidden');
          return;
        }

        sugBox.innerHTML = '';
        matches.slice(0, 15).forEach((m, idx) => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'px-3 py-2 border-b border-slate-100 last:border-0 suggestion-item cursor-pointer flex items-center justify-between text-left';
          itemDiv.dataset.index = idx;

          const unitStr = m.unit ? ` <span class="text-brand-600 font-medium">(${escapeHtml(m.unit)})</span>` : '';
          itemDiv.innerHTML = `
            <div>
              <span class="block text-xs font-semibold text-slate-800">${escapeHtml(m.name)}</span>
              <span class="block text-[11px] text-slate-500">${escapeHtml(m.position)}${unitStr}</span>
            </div>
            <span class="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">เลือก</span>
          `;

          itemDiv.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectStaff(m);
          });

          sugBox.appendChild(itemDiv);
        });

        sugBox.classList.remove('hidden');
        activeIndex = -1;
      }

      nameInput.addEventListener('input', (e) => {
        renderSuggestions(e.target.value);
      });

      nameInput.addEventListener('focus', (e) => {
        if (e.target.value.trim()) {
          renderSuggestions(e.target.value);
        }
      });

      nameInput.addEventListener('keydown', (e) => {
        const items = sugBox.querySelectorAll('.suggestion-item');
        if (!items.length || sugBox.classList.contains('hidden')) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          activeIndex = (activeIndex + 1) % items.length;
          updateActiveItem(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          activeIndex = (activeIndex - 1 + items.length) % items.length;
          updateActiveItem(items);
        } else if (e.key === 'Enter') {
          if (activeIndex >= 0 && activeIndex < items.length) {
            e.preventDefault();
            items[activeIndex].dispatchEvent(new MouseEvent('mousedown'));
          }
        } else if (e.key === 'Escape') {
          closeSuggestions();
        }
      });

      function updateActiveItem(items) {
        items.forEach((it, i) => {
          if (i === activeIndex) {
            it.classList.add('active');
            it.scrollIntoView({ block: 'nearest' });
          } else {
            it.classList.remove('active');
          }
        });
      }

      nameInput.addEventListener('blur', () => {
        setTimeout(closeSuggestions, 200);
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.staff-autocomplete-input') && !e.target.closest('.suggestion-list')) {
        document.querySelectorAll('.suggestion-list').forEach(el => {
          el.classList.add('hidden');
          el.innerHTML = '';
        });
      }
    });
  }

  function renderVendorDropdown() {
    vendorSelect.innerHTML = '<option value="">-- เลือกร้านค้าที่บันทึกไว้ --</option>';
    currentVendors.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.province || 'สุโขทัย'})`;
      vendorSelect.appendChild(opt);
    });
  }

  // ----------------------------------------------------
  // Document Type & Approver Toggle
  // ----------------------------------------------------
  form.querySelectorAll('input[name="doc_type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'hire') {
        hireJobWrapper.style.display = 'block';
        hireJobInput.setAttribute('required', 'required');
      } else {
        hireJobWrapper.style.display = 'none';
        hireJobInput.removeAttribute('required');
      }
    });
  });

  form.querySelectorAll('input[name="approver_type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const headSuppliesInput = document.getElementById('head_supplies');
      if (e.target.value === 'director') {
        headSuppliesInput.value = 'อดิศักดิ์  บัวดี';
      } else {
        headSuppliesInput.value = 'สมพร  บุญยัง';
      }
    });
  });

  // ----------------------------------------------------
  // Thai Geography Cascading Dropdowns (77 Provinces, Districts, Subdistricts, Zipcode)
  // ----------------------------------------------------
  const provSelect = document.getElementById('vendor_province');
  const distSelect = document.getElementById('vendor_district');
  const subdistSelect = document.getElementById('vendor_subdistrict');
  const zipInput = document.getElementById('vendor_zipcode');

  async function loadGeography() {
    try {
      const res = await fetch('/api/geography');
      const json = await res.json();
      if (json.status === 'success') {
        geoData = json.data;
        populateProvinces(provSelect ? provSelect.value || 'สุโขทัย' : 'สุโขทัย');
      }
    } catch (err) {
      console.error('Failed to load geography data:', err);
    }
  }

  function populateProvinces(selectedProvince = 'สุโขทัย') {
    if (!geoData || !provSelect) return;
    const curVal = selectedProvince || provSelect.value || 'สุโขทัย';
    provSelect.innerHTML = '<option value="">-- เลือกจังหวัด --</option>';
    const provinces = Object.keys(geoData).sort((a, b) => a.localeCompare(b, 'th'));
    provinces.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      provSelect.appendChild(opt);
    });

    if (curVal && geoData[curVal]) {
      provSelect.value = curVal;
      populateDistricts(curVal, distSelect ? distSelect.value : '');
    }
  }

  function populateDistricts(province, selectedDistrict = '', selectedSubdistrict = '', targetZip = '') {
    if (!distSelect) return;
    distSelect.innerHTML = '<option value="">-- เลือกอำเภอ/เขต --</option>';
    if (subdistSelect) subdistSelect.innerHTML = '<option value="">-- เลือกตำบล/แขวง --</option>';
    if (zipInput && !targetZip) zipInput.value = '';

    if (!province || !geoData || !geoData[province]) return;

    const districts = Object.keys(geoData[province]).sort((a, b) => a.localeCompare(b, 'th'));
    districts.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      distSelect.appendChild(opt);
    });

    if (selectedDistrict) {
      if (![...distSelect.options].some(o => o.value === selectedDistrict)) {
        const opt = document.createElement('option');
        opt.value = selectedDistrict;
        opt.textContent = selectedDistrict;
        distSelect.appendChild(opt);
      }
      distSelect.value = selectedDistrict;
      populateSubdistricts(province, selectedDistrict, selectedSubdistrict, targetZip);
    }
  }

  function populateSubdistricts(province, district, selectedSubdistrict = '', targetZip = '') {
    if (!subdistSelect) return;
    subdistSelect.innerHTML = '<option value="">-- เลือกตำบล/แขวง --</option>';
    if (zipInput && !targetZip) zipInput.value = '';

    if (!province || !district || !geoData || !geoData[province] || !geoData[province][district]) return;

    const subdistricts = Object.keys(geoData[province][district]).sort((a, b) => a.localeCompare(b, 'th'));
    subdistricts.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      subdistSelect.appendChild(opt);
    });

    if (selectedSubdistrict) {
      if (![...subdistSelect.options].some(o => o.value === selectedSubdistrict)) {
        const opt = document.createElement('option');
        opt.value = selectedSubdistrict;
        opt.textContent = selectedSubdistrict;
        subdistSelect.appendChild(opt);
      }
      subdistSelect.value = selectedSubdistrict;
      if (zipInput) {
        if (targetZip) {
          zipInput.value = targetZip;
        } else {
          zipInput.value = geoData[province][district][selectedSubdistrict] || '';
        }
      }
    }
  }

  if (provSelect) {
    provSelect.addEventListener('change', () => {
      populateDistricts(provSelect.value);
    });
  }

  if (distSelect) {
    distSelect.addEventListener('change', () => {
      populateSubdistricts(provSelect.value, distSelect.value);
    });
  }

  if (subdistSelect) {
    subdistSelect.addEventListener('change', () => {
      const p = provSelect.value;
      const d = distSelect.value;
      const s = subdistSelect.value;
      if (geoData && geoData[p] && geoData[p][d] && geoData[p][d][s] && zipInput) {
        zipInput.value = geoData[p][d][s];
      }
    });
  }

  function setVendorAddress(province, district, subdistrict, zipcode) {
    const prov = province || 'สุโขทัย';
    if (geoData) {
      if (provSelect) {
        if (![...provSelect.options].some(o => o.value === prov)) {
          const opt = document.createElement('option');
          opt.value = prov;
          opt.textContent = prov;
          provSelect.appendChild(opt);
        }
        provSelect.value = prov;
      }
      populateDistricts(prov, district, subdistrict, zipcode);
    } else {
      setTimeout(() => setVendorAddress(province, district, subdistrict, zipcode), 150);
    }
  }

  // ----------------------------------------------------
  // Vendor Management
  // ----------------------------------------------------
  vendorSelect.addEventListener('change', (e) => {
    const selectedName = e.target.value;
    if (!selectedName) return;

    const vendor = currentVendors.find(v => v.name === selectedName);
    if (vendor) {
      document.getElementById('vendor_name').value = vendor.name || '';
      document.getElementById('vendor_tax_id').value = vendor.tax_id || '';
      document.getElementById('vendor_phone').value = vendor.phone || '';
      document.getElementById('vendor_address').value = vendor.address || '';
      setVendorAddress(vendor.province || 'สุโขทัย', vendor.district || '', vendor.subdistrict || '', vendor.zipcode || '');
      document.getElementById('vendor_signer_name').value = vendor.signer_name || '';
      document.getElementById('vendor_signer_position').value = vendor.signer_position || 'เจ้าของกิจการ';
      showToast(`โหลดข้อมูลร้าน "${vendor.name}" เรียบร้อย`, 'success');
    }
  });

  btnSaveCurrentVendor.addEventListener('click', async () => {
    const name = document.getElementById('vendor_name').value.trim();
    if (!name) {
      showToast('กรุณาระบุชื่อร้านค้าก่อนบันทึก', 'warning');
      return;
    }

    const vendorData = {
      name: name,
      tax_id: document.getElementById('vendor_tax_id').value.trim(),
      phone: document.getElementById('vendor_phone').value.trim(),
      address: document.getElementById('vendor_address').value.trim(),
      subdistrict: document.getElementById('vendor_subdistrict').value.trim(),
      district: document.getElementById('vendor_district').value.trim(),
      province: document.getElementById('vendor_province').value.trim(),
      zipcode: document.getElementById('vendor_zipcode').value.trim(),
      signer_name: document.getElementById('vendor_signer_name').value.trim(),
      signer_position: document.getElementById('vendor_signer_position').value.trim()
    };

    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vendorData)
      });
      const json = await res.json();
      if (json.status === 'success') {
        currentVendors = json.data;
        renderVendorDropdown();
        vendorSelect.value = name;
        showToast(`บันทึกข้อมูลร้าน "${name}" ในระบบแล้ว`, 'success');
      } else {
        showToast(json.message || 'เกิดข้อผิดพลาดในการบันทึกร้าน', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  });

  // ----------------------------------------------------
  // Dynamic Items Table
  // ----------------------------------------------------
  function createItemRow(item = { name: '', qty: 1, unit: 'รายการ', price_per_unit: 0 }) {
    const tr = document.createElement('tr');
    tr.className = 'item-row hover:bg-slate-50/80 transition';

    const subtotal = (parseFloat(item.qty) || 0) * (parseFloat(item.price_per_unit) || 0);

    tr.innerHTML = `
      <td class="py-2.5 px-3 text-center text-xs font-semibold text-slate-500 row-index"></td>
      <td class="py-2.5 px-3">
        <input type="text" class="table-input item-name" required placeholder="ชื่อรายการพัสดุ / บริการ" value="${escapeHtml(item.name)}">
      </td>
      <td class="py-2.5 px-3">
        <input type="number" class="table-input text-center item-qty" required min="1" step="1" value="${item.qty}">
      </td>
      <td class="py-2.5 px-3">
        <input type="text" class="table-input text-center item-unit" required placeholder="หน่วย" value="${escapeHtml(item.unit)}">
      </td>
      <td class="py-2.5 px-3">
        <input type="number" class="table-input text-right item-price font-mono" required min="0" step="0.01" value="${item.price_per_unit}">
      </td>
      <td class="py-2.5 px-3 text-right font-mono font-semibold text-slate-800 item-subtotal">
        ${subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td class="py-2.5 px-2 text-center">
        <button type="button" class="text-slate-400 hover:text-rose-600 transition p-1 text-base btn-remove-row" title="ลบแถวนี้">&times;</button>
      </td>
    `;

    // Row event listeners
    const qtyInput = tr.querySelector('.item-qty');
    const priceInput = tr.querySelector('.item-price');
    const btnRemove = tr.querySelector('.btn-remove-row');

    const updateRow = () => {
      const q = parseFloat(qtyInput.value) || 0;
      const p = parseFloat(priceInput.value) || 0;
      const sub = q * p;
      tr.querySelector('.item-subtotal').textContent = sub.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      calculateFinancials();
    };

    qtyInput.addEventListener('input', updateRow);
    priceInput.addEventListener('input', updateRow);

    btnRemove.addEventListener('click', () => {
      const rows = itemsTableBody.querySelectorAll('.item-row');
      if (rows.length <= 1) {
        showToast('ต้องมีรายการพัสดุอย่างน้อย 1 รายการ', 'warning');
        return;
      }
      tr.remove();
      updateRowIndices();
      calculateFinancials();
    });

    itemsTableBody.appendChild(tr);
    updateRowIndices();
    calculateFinancials();
  }

  function updateRowIndices() {
    const rows = itemsTableBody.querySelectorAll('.item-row');
    rows.forEach((r, idx) => {
      r.querySelector('.row-index').textContent = idx + 1;
    });
  }

  btnAddItem.addEventListener('click', () => {
    createItemRow();
  });

  // Initial Item Row
  createItemRow({ name: 'อุปกรณ์ทำความสะอาดและน้ำยาล้างมือ', qty: 1, unit: 'ชุด', price_per_unit: 1700 });

  // ----------------------------------------------------
  // Financial Calculations & Baht Text
  // ----------------------------------------------------
  function calculateFinancials() {
    const rows = itemsTableBody.querySelectorAll('.item-row');
    let totalGoods = 0;

    rows.forEach(r => {
      const q = parseFloat(r.querySelector('.item-qty').value) || 0;
      const p = parseFloat(r.querySelector('.item-price').value) || 0;
      totalGoods += q * p;
    });

    const hasVat = hasVatCheckbox.checked;
    const hasWht = hasWhtCheckbox.checked;
    const fine = parseFloat(fineAmountInput.value) || 0;

    let preVat = totalGoods;
    let vat = 0;
    let totalReq = totalGoods;

    if (hasVat) {
      vat = Math.round((totalGoods * 7 / 107) * 100) / 100;
      preVat = Math.round((totalGoods - vat) * 100) / 100;
      rowVat.style.display = 'flex';
      dispVat.textContent = `${vat.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
    } else {
      rowVat.style.display = 'none';
      dispVat.textContent = '-';
    }

    let wht = 0;
    if (hasWht) {
      wht = Math.round((preVat * 0.01) * 100) / 100;
      rowWht.style.display = 'flex';
      dispWht.textContent = `-${wht.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
    } else {
      rowWht.style.display = 'none';
      dispWht.textContent = '-';
    }

    if (fine > 0) {
      rowFine.style.display = 'flex';
      dispFine.textContent = `-${fine.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
    } else {
      rowFine.style.display = 'none';
      dispFine.textContent = '-';
    }

    const netPay = Math.round((totalReq - wht - fine) * 100) / 100;

    dispGoodsValue.textContent = `${totalGoods.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
    dispTotalAmount.textContent = `${totalReq.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
    dispNetPay.textContent = `${netPay.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;

    // Debounce baht text API call
    clearTimeout(bahtDebounceTimer);
    bahtDebounceTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/bahttext', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: totalReq })
        });
        const json = await res.json();
        if (json.status === 'success') {
          dispBahtText.textContent = json.data.text;
        }
      } catch (err) {
        console.error('Failed to get baht text:', err);
      }
    }, 250);
  }

  hasVatCheckbox.addEventListener('change', calculateFinancials);
  hasWhtCheckbox.addEventListener('change', calculateFinancials);
  fineAmountInput.addEventListener('input', calculateFinancials);

  // ----------------------------------------------------
  // 8-Digit Date Conversion & Date Checking (Realtime)
  // ----------------------------------------------------
  const THAI_MONTHS_MAP = {
    1: 'มกราคม', 2: 'กุมภาพันธ์', 3: 'มีนาคม', 4: 'เมษายน',
    5: 'พฤษภาคม', 6: 'มิถุนายน', 7: 'กรกฎาคม', 8: 'สิงหาคม',
    9: 'กันยายน', 10: 'ตุลาคม', 11: 'พฤศจิกายน', 12: 'ธันวาคม'
  };

  function convertRawDateToThai(raw) {
    if (!raw) return raw;
    let s = raw.trim();
    if (!s) return s;

    // Already formatted Thai date e.g. "8 สิงหาคม 2569"
    if (/^\d{1,2}\s+[^\d\s]+\s+\d{4}$/.test(s)) {
      return s;
    }

    // Delimited: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) {
      const d = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      let yr = parseInt(m[3], 10);
      if (yr < 2400) yr += 543;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return `${d} ${THAI_MONTHS_MAP[mo]} ${yr}`;
      }
    }

    // Pure digits: 8 digits (DDMMYYYY) or 7 digits (DMMYYYY)
    const digits = s.replace(/\D/g, '');
    if (digits.length === 8) {
      const d = parseInt(digits.slice(0, 2), 10);
      const mo = parseInt(digits.slice(2, 4), 10);
      let yr = parseInt(digits.slice(4, 8), 10);
      if (yr < 2400) yr += 543;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return `${d} ${THAI_MONTHS_MAP[mo]} ${yr}`;
      }
    } else if (digits.length === 7) {
      const d = parseInt(digits.slice(0, 1), 10);
      const mo = parseInt(digits.slice(1, 3), 10);
      let yr = parseInt(digits.slice(3, 7), 10);
      if (yr < 2400) yr += 543;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return `${d} ${THAI_MONTHS_MAP[mo]} ${yr}`;
      }
    }

    return s;
  }

  const dateFields = [
    'doc1_date',
    'doc2_date',
    'po_date',
    'delivery_due_date',
    'delivery_actual_date',
    'doc3_date',
    'receipt_date'
  ];

  function validateDateField(fieldId, dateStr) {
    const warnEl = document.getElementById(`warn_${fieldId}`);
    const inputEl = document.getElementById(fieldId);
    if (!inputEl) return;

    if (!dateStr || !dateStr.trim()) {
      if (warnEl) warnEl.classList.add('hidden');
      inputEl.classList.remove('input-warning-holiday', 'input-warning-weekend');
      return;
    }

    clearTimeout(dateDebounceTimers[fieldId]);
    dateDebounceTimers[fieldId] = setTimeout(async () => {
      try {
        const res = await fetch('/api/check-date', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: dateStr })
        });
        const json = await res.json();
        if (json.status === 'success' && warnEl) {
          const status = json.data;
          inputEl.classList.remove('input-warning-holiday', 'input-warning-weekend');

          if (status.is_holiday) {
            inputEl.classList.add('input-warning-holiday');
            warnEl.innerHTML = `<span class="date-warning-badge holiday">⚠️ ตรงกับ${status.holiday_name} (วันหยุดนักขัตฤกษ์)</span>`;
            warnEl.classList.remove('hidden');
          } else if (status.is_weekend) {
            inputEl.classList.add('input-warning-weekend');
            warnEl.innerHTML = `<span class="date-warning-badge weekend">⚠️ ตรงกับ${status.weekday_thai} (วันหยุดสุดสัปดาห์)</span>`;
            warnEl.classList.remove('hidden');
          } else {
            warnEl.innerHTML = `<span class="date-warning-badge working">✓ ${status.weekday_thai} (วันทำการปกติ)</span>`;
            warnEl.classList.remove('hidden');
          }
        }
      } catch (err) {
        console.error(`Check date error for ${fieldId}:`, err);
      }
    }, 300);
  }

  dateFields.forEach(fieldId => {
    const input = document.getElementById(fieldId);
    if (input) {
      input.addEventListener('input', (e) => {
        const conv = convertRawDateToThai(e.target.value);
        validateDateField(fieldId, conv);
      });

      input.addEventListener('blur', (e) => {
        const conv = convertRawDateToThai(e.target.value);
        if (conv !== e.target.value) {
          e.target.value = conv;
        }
        validateDateField(fieldId, e.target.value);

        if (fieldId === 'doc2_date') {
          const poInput = document.getElementById('po_date');
          if (poInput && !poInput.value.trim()) {
            poInput.value = e.target.value;
            validateDateField('po_date', poInput.value);
            autoCalcFromPo();
          }
        } else if (fieldId === 'po_date') {
          autoCalcFromPo();
        }
      });

      input.addEventListener('change', (e) => {
        const conv = convertRawDateToThai(e.target.value);
        if (conv !== e.target.value) {
          e.target.value = conv;
        }
        validateDateField(fieldId, e.target.value);

        if (fieldId === 'doc2_date') {
          const poInput = document.getElementById('po_date');
          if (poInput && !poInput.value.trim()) {
            poInput.value = e.target.value;
            validateDateField('po_date', poInput.value);
            autoCalcFromPo();
          }
        } else if (fieldId === 'po_date') {
          autoCalcFromPo();
        }
      });
    }
  });

  // ----------------------------------------------------
  // Document Numbers Auto-Increment (+1, +2)
  // ----------------------------------------------------
  const doc1NoInput = document.getElementById('doc1_no');
  const doc2NoInput = document.getElementById('doc2_no');
  const doc3NoInput = document.getElementById('doc3_no');

  function autoIncrementDocNos() {
    const val = doc1NoInput.value.trim();
    if (!val) return;

    const m = val.match(/^([^\d]*)(\d+)(.*)$/);
    if (m) {
      const prefix = m[1];
      const num = parseInt(m[2], 10);
      const suffix = m[3];
      const padLen = m[2].length;

      const n2 = String(num + 1).padStart(padLen, '0');
      const n3 = String(num + 2).padStart(padLen, '0');

      doc2NoInput.value = `${prefix}${n2}${suffix}`;
      doc3NoInput.value = `${prefix}${n3}${suffix}`;
    }
  }

  doc1NoInput.addEventListener('input', autoIncrementDocNos);
  doc1NoInput.addEventListener('blur', autoIncrementDocNos);

  // ----------------------------------------------------
  // Auto-Calculate Working Dates from po_date + delivery_days
  // ----------------------------------------------------
  async function autoCalcFromPo() {
    const poInput = document.getElementById('po_date');
    const poVal = convertRawDateToThai(poInput.value.trim());
    if (poVal !== poInput.value) {
      poInput.value = poVal;
    }
    const deliveryDays = parseInt(document.getElementById('delivery_days').value, 10) || 5;
    if (!poVal) return;

    try {
      const res = await fetch('/api/calculate-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calc_type: 'from_po',
          start_date: poVal,
          delivery_days: deliveryDays
        })
      });
      const json = await res.json();
      if (json.status === 'success') {
        const d = json.data;
        document.getElementById('delivery_due_date').value = d.delivery_due_date;
        document.getElementById('delivery_actual_date').value = d.delivery_actual_date;
        document.getElementById('doc3_date').value = d.doc3_date;

        ['po_date', 'delivery_due_date', 'delivery_actual_date', 'doc3_date'].forEach(f => {
          validateDateField(f, document.getElementById(f).value);
        });
      }
    } catch (err) {
      console.error('Auto calc from po error:', err);
    }
  }

  async function autoCalcFromDoc2() {
    const doc2Input = document.getElementById('doc2_date');
    const doc2Val = convertRawDateToThai(doc2Input.value.trim());
    if (doc2Val !== doc2Input.value) {
      doc2Input.value = doc2Val;
    }
    const deliveryDays = parseInt(document.getElementById('delivery_days').value, 10) || 5;
    if (!doc2Val) return;

    try {
      const res = await fetch('/api/calculate-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calc_type: 'from_doc2',
          start_date: doc2Val,
          delivery_days: deliveryDays
        })
      });
      const json = await res.json();
      if (json.status === 'success') {
        const d = json.data;
        document.getElementById('delivery_due_date').value = d.delivery_due_date;
        document.getElementById('delivery_actual_date').value = d.delivery_actual_date;
        document.getElementById('doc3_date').value = d.doc3_date;

        ['doc2_date', 'delivery_due_date', 'delivery_actual_date', 'doc3_date'].forEach(f => {
          validateDateField(f, document.getElementById(f).value);
        });
      }
    } catch (err) {
      console.error('Auto calc from doc2 error:', err);
    }
  }

  ['input', 'change', 'blur'].forEach(evt => {
    document.getElementById('delivery_days').addEventListener(evt, () => {
      if (document.getElementById('po_date').value.trim()) {
        autoCalcFromPo();
      } else if (document.getElementById('doc2_date').value.trim()) {
        autoCalcFromDoc2();
      }
    });
  });

  // ----------------------------------------------------
  // Auto-Calculate Working Dates from doc1_date
  // ----------------------------------------------------
  async function autoCalculateDates() {
    const doc1Input = document.getElementById('doc1_date');
    let doc1Date = convertRawDateToThai(doc1Input.value.trim());
    if (doc1Date !== doc1Input.value) {
      doc1Input.value = doc1Date;
    }
    const deliveryDays = parseInt(document.getElementById('delivery_days').value, 10) || 5;

    try {
      btnAutoCalcDates.disabled = true;
      btnAutoCalcDates.classList.add('opacity-75');

      const res = await fetch('/api/calculate-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calc_type: 'from_doc1',
          start_date: doc1Date,
          delivery_days: deliveryDays
        })
      });

      const json = await res.json();
      if (json.status === 'success') {
        const d = json.data;
        document.getElementById('doc1_date').value = d.doc1_date;
        document.getElementById('doc2_date').value = d.doc2_date;
        document.getElementById('po_date').value = d.po_date;
        document.getElementById('delivery_due_date').value = d.delivery_due_date;
        document.getElementById('delivery_actual_date').value = d.delivery_actual_date;
        document.getElementById('doc3_date').value = d.doc3_date;

        // Trigger validations for UI badges
        ['doc1_date', 'doc2_date', 'po_date', 'delivery_due_date', 'delivery_actual_date', 'doc3_date'].forEach(f => {
          validateDateField(f, document.getElementById(f).value);
        });

        showToast('คำนวณวันทำการ 6 หน้า อัตโนมัติแล้ว (ข้ามวันหยุดทั้งหมด)', 'success');
      } else {
        showToast(json.message || 'ไม่สามารถคำนวณวันได้', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการคำนวณวันที่', 'error');
    } finally {
      btnAutoCalcDates.disabled = false;
      btnAutoCalcDates.classList.remove('opacity-75');
    }
  }

  btnAutoCalcDates.addEventListener('click', autoCalculateDates);

  // ----------------------------------------------------
  // Collect Form Data
  // ----------------------------------------------------
  function collectFormData() {
    const docType = form.querySelector('input[name="doc_type"]:checked').value;
    const approverType = form.querySelector('input[name="approver_type"]:checked').value;

    const items = [];
    itemsTableBody.querySelectorAll('.item-row').forEach(row => {
      const name = row.querySelector('.item-name').value.trim();
      const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
      const unit = row.querySelector('.item-unit').value.trim();
      const price = parseFloat(row.querySelector('.item-price').value) || 0;
      items.push({
        name: name,
        qty: qty,
        unit: unit,
        price_per_unit: price,
        total_price: qty * price
      });
    });

    return {
      doc_type: docType,
      approver_type: approverType,
      department: document.getElementById('department').value.trim(),
      project_name: document.getElementById('project_name').value.trim(),
      hire_job_name: document.getElementById('hire_job_name').value.trim(),
      doc1_date: document.getElementById('doc1_date').value.trim(),
      doc1_no: document.getElementById('doc1_no').value.trim(),
      doc2_date: document.getElementById('doc2_date').value.trim(),
      doc2_no: document.getElementById('doc2_no').value.trim(),
      po_date: document.getElementById('po_date').value.trim(),
      po_no: document.getElementById('po_no').value.trim(),
      delivery_days: document.getElementById('delivery_days').value.trim(),
      delivery_due_date: document.getElementById('delivery_due_date').value.trim(),
      delivery_actual_date: document.getElementById('delivery_actual_date').value.trim(),
      doc3_date: document.getElementById('doc3_date').value.trim(),
      doc3_no: document.getElementById('doc3_no').value.trim(),
      vendor: {
        name: document.getElementById('vendor_name').value.trim(),
        tax_id: document.getElementById('vendor_tax_id').value.trim(),
        phone: document.getElementById('vendor_phone').value.trim(),
        address: document.getElementById('vendor_address').value.trim(),
        province: document.getElementById('vendor_province').value.trim(),
        district: document.getElementById('vendor_district').value.trim(),
        subdistrict: document.getElementById('vendor_subdistrict').value.trim(),
        zipcode: document.getElementById('vendor_zipcode').value.trim(),
        signer_name: document.getElementById('vendor_signer_name').value.trim(),
        signer_position: document.getElementById('vendor_signer_position').value.trim()
      },
      receipt: {
        type: document.getElementById('receipt_type').value,
        book_no: document.getElementById('receipt_book_no').value.trim(),
        no: document.getElementById('receipt_no').value.trim(),
        date: document.getElementById('receipt_date').value.trim() || document.getElementById('delivery_actual_date').value.trim()
      },
      committee: [
        { name: document.getElementById('c1_name').value.trim(), position: document.getElementById('c1_pos').value.trim() },
        { name: document.getElementById('c2_name').value.trim(), position: document.getElementById('c2_pos').value.trim() },
        { name: document.getElementById('c3_name').value.trim(), position: document.getElementById('c3_pos').value.trim() }
      ],
      officers: {
        officer_supplies: document.getElementById('officer_supplies').value.trim(),
        head_supplies: document.getElementById('head_supplies').value.trim(),
        finance_officer: document.getElementById('finance_officer').value.trim()
      },
      items: items,
      has_vat: hasVatCheckbox.checked,
      has_withholding_tax: hasWhtCheckbox.checked,
      fine_amount: parseFloat(fineAmountInput.value) || 0
    };
  }

  // ----------------------------------------------------
  // Form Populate from Draft
  // ----------------------------------------------------
  function populateForm(data) {
    if (!data) return;

    // Doc Type
    if (data.doc_type) {
      const radio = form.querySelector(`input[name="doc_type"][value="${data.doc_type}"]`);
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change'));
      }
    }

    // Approver
    if (data.approver_type) {
      const radio = form.querySelector(`input[name="approver_type"][value="${data.approver_type}"]`);
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change'));
      }
    }

    // Text inputs
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.value = val;
    };

    setVal('department', data.department);
    setVal('project_name', data.project_name);
    setVal('hire_job_name', data.hire_job_name);
    setVal('doc1_date', data.doc1_date);
    setVal('doc1_no', data.doc1_no);
    setVal('doc2_date', data.doc2_date);
    setVal('doc2_no', data.doc2_no);
    setVal('po_date', data.po_date || data.doc2_date);
    setVal('po_no', data.po_no);
    setVal('delivery_days', data.delivery_days);
    setVal('delivery_due_date', data.delivery_due_date);
    setVal('delivery_actual_date', data.delivery_actual_date);
    setVal('doc3_date', data.doc3_date);
    setVal('doc3_no', data.doc3_no);

    // Validate dates
    ['doc1_date', 'doc2_date', 'po_date', 'delivery_due_date', 'delivery_actual_date', 'doc3_date'].forEach(f => {
      const el = document.getElementById(f);
      if (el && el.value) validateDateField(f, el.value);
    });

    // Vendor
    if (data.vendor) {
      setVal('vendor_name', data.vendor.name);
      setVal('vendor_tax_id', data.vendor.tax_id);
      setVal('vendor_phone', data.vendor.phone);
      setVal('vendor_address', data.vendor.address);
      setVendorAddress(
        data.vendor.province || 'สุโขทัย',
        data.vendor.district || '',
        data.vendor.subdistrict || '',
        data.vendor.zipcode || ''
      );
      setVal('vendor_signer_name', data.vendor.signer_name);
      setVal('vendor_signer_position', data.vendor.signer_position);
    }

    // Receipt
    if (data.receipt) {
      setVal('receipt_type', data.receipt.type);
      setVal('receipt_book_no', data.receipt.book_no);
      setVal('receipt_no', data.receipt.no);
      setVal('receipt_date', data.receipt.date);
    }

    // Committee
    if (data.committee && data.committee.length >= 3) {
      setVal('c1_name', data.committee[0].name);
      setVal('c1_pos', data.committee[0].position);
      setVal('c2_name', data.committee[1].name);
      setVal('c2_pos', data.committee[1].position);
      setVal('c3_name', data.committee[2].name);
      setVal('c3_pos', data.committee[2].position);
    }

    // Officers
    if (data.officers) {
      setVal('officer_supplies', data.officers.officer_supplies);
      setVal('head_supplies', data.officers.head_supplies);
      setVal('finance_officer', data.officers.finance_officer);
    }

    // Toggles
    hasVatCheckbox.checked = !!data.has_vat;
    hasWhtCheckbox.checked = !!data.has_withholding_tax;
    setVal('fine_amount', data.fine_amount || 0);

    // Items
    itemsTableBody.innerHTML = '';
    if (data.items && data.items.length > 0) {
      data.items.forEach(item => createItemRow(item));
    } else {
      createItemRow();
    }

    // Validate dates
    dateFields.forEach(f => {
      const el = document.getElementById(f);
      if (el) validateDateField(f, el.value);
    });

    calculateFinancials();
  }

  // ----------------------------------------------------
  // Drafts Modal & Actions
  // ----------------------------------------------------
  async function loadDrafts() {
    try {
      const res = await fetch('/api/drafts');
      const json = await res.json();
      if (json.status === 'success') {
        currentDrafts = json.data;
        renderDraftsList();
      }
    } catch (err) {
      console.error(err);
      showToast('ไม่สามารถโหลดแบบร่างได้', 'error');
    }
  }

  function renderDraftsList() {
    const listEl = document.getElementById('draftsList');
    if (!currentDrafts || currentDrafts.length === 0) {
      listEl.innerHTML = `
        <div class="text-center py-12 text-slate-400">
          <span class="text-4xl block mb-2">📂</span>
          ยังไม่มีแบบร่างที่บันทึกไว้
        </div>
      `;
      return;
    }

    listEl.innerHTML = '';
    currentDrafts.forEach(draft => {
      const card = document.createElement('div');
      card.className = 'p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 transition';

      const typeLabel = draft.doc_type === 'hire' ? 'จัดจ้าง' : 'จัดซื้อ';
      const totalAmount = (draft.items || []).reduce((sum, it) => sum + (parseFloat(it.total_price) || 0), 0);

      card.innerHTML = `
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 text-xs font-bold rounded ${draft.doc_type === 'hire' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}">${typeLabel}</span>
            <span class="font-bold text-slate-800 text-sm">${escapeHtml(draft.project_name || 'ไม่มีชื่อโครงการ')}</span>
          </div>
          <div class="text-xs text-slate-500 flex flex-wrap gap-x-4">
            <span>หน่วยงาน: ${escapeHtml(draft.department || '-')}</span>
            <span>ร้านค้า: ${escapeHtml(draft.vendor?.name || '-')}</span>
            <span>ยอดรวม: <b class="font-mono text-slate-700">${totalAmount.toLocaleString()} บาท</b></span>
            <span>บันทึกเมื่อ: ${draft.updated_at || '-'}</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="btn-load-draft px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg shadow-sm transition active:scale-95" data-id="${draft.id}">
            เปิดแบบร่างนี้
          </button>
          <button type="button" class="btn-delete-draft p-1.5 text-slate-400 hover:text-rose-600 transition text-sm" data-id="${draft.id}" title="ลบแบบร่าง">&times;</button>
        </div>
      `;

      card.querySelector('.btn-load-draft').addEventListener('click', () => {
        populateForm(draft);
        modalDrafts.classList.add('hidden');
        showToast('เปิดแบบร่างเรียบร้อยแล้ว', 'success');
      });

      card.querySelector('.btn-delete-draft').addEventListener('click', async () => {
        if (confirm('ต้องการลบแบบร่างนี้ใช่หรือไม่?')) {
          await deleteDraft(draft.id);
        }
      });

      listEl.appendChild(card);
    });
  }

  async function deleteDraft(id) {
    try {
      const res = await fetch(`/api/drafts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.status === 'success') {
        currentDrafts = currentDrafts.filter(d => d.id !== id);
        renderDraftsList();
        showToast('ลบแบบร่างเรียบร้อยแล้ว', 'info');
      }
    } catch (err) {
      console.error(err);
      showToast('ไม่สามารถลบแบบร่างได้', 'error');
    }
  }

  btnSaveDraft.addEventListener('click', async () => {
    const data = collectFormData();
    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (json.status === 'success') {
        showToast('บันทึกแบบร่างสำเร็จเรียบร้อย', 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการบันทึกแบบร่าง', 'error');
    }
  });

  btnOpenDrafts.addEventListener('click', () => {
    loadDrafts();
    modalDrafts.classList.remove('hidden');
  });

  // ----------------------------------------------------
  // Vendors Modal
  // ----------------------------------------------------
  btnOpenVendors.addEventListener('click', () => {
    renderVendorsModal();
    modalVendors.classList.remove('hidden');
  });

  function renderVendorsModal() {
    const listEl = document.getElementById('vendorsList');
    if (!currentVendors || currentVendors.length === 0) {
      listEl.innerHTML = '<div class="text-center py-8 text-slate-400">ไม่มีรายชื่อร้านค้า</div>';
      return;
    }

    listEl.innerHTML = '';
    currentVendors.forEach(v => {
      const item = document.createElement('div');
      item.className = 'p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 transition';

      item.innerHTML = `
        <div class="space-y-1">
          <div class="font-bold text-slate-800 text-sm">${escapeHtml(v.name)}</div>
          <div class="text-xs text-slate-500">
            <span>เลขภาษี: ${escapeHtml(v.tax_id || '-')}</span> •
            <span>ที่อยู่: ${escapeHtml(v.address || '')} ต.${escapeHtml(v.subdistrict || '')} อ.${escapeHtml(v.district || '')} จ.${escapeHtml(v.province || '')} ${escapeHtml(v.zipcode || '')}</span>
          </div>
          <div class="text-xs text-slate-600 font-medium">
            <span>ผู้ลงนาม: ${escapeHtml(v.signer_name || '-')} (${escapeHtml(v.signer_position || '-')})</span>
            ${v.phone ? ` • <span>โทร: ${escapeHtml(v.phone)}</span>` : ''}
          </div>
        </div>
        <div>
          <button type="button" class="btn-use-vendor px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg shadow-sm transition active:scale-95">
            เลือกร้านนี้
          </button>
        </div>
      `;

      item.querySelector('.btn-use-vendor').addEventListener('click', () => {
        vendorSelect.value = v.name;
        vendorSelect.dispatchEvent(new Event('change'));
        modalVendors.classList.add('hidden');
      });

      listEl.appendChild(item);
    });
  }

  // ----------------------------------------------------
  // Preview Modal
  // ----------------------------------------------------
  btnPreview.addEventListener('click', () => {
    const data = collectFormData();
    const content = document.getElementById('previewContent');

    const typeStr = data.doc_type === 'hire' ? 'จัดจ้างพัสดุ (จ้าง)' : 'จัดซื้อพัสดุ (ซื้อ)';
    const approverStr = data.approver_type === 'director' ? 'ผู้อำนวยการ (นายประวิทย์ เรืองเดช)' : 'รองผู้อำนวยการ รักษาการ (ว่าที่ร้อยตรี อดิศักดิ์ บัวดี)';
    const totalAmount = data.items.reduce((s, it) => s + it.total_price, 0);

    let itemsHtml = data.items.map((it, idx) => `
      <tr class="border-b border-slate-100">
        <td class="py-1.5 px-2 text-center text-xs">${idx + 1}</td>
        <td class="py-1.5 px-2 text-xs font-medium">${escapeHtml(it.name)}</td>
        <td class="py-1.5 px-2 text-center text-xs">${it.qty} ${escapeHtml(it.unit)}</td>
        <td class="py-1.5 px-2 text-right text-xs font-mono">${it.price_per_unit.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
        <td class="py-1.5 px-2 text-right text-xs font-mono font-semibold">${it.total_price.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
      </tr>
    `).join('');

    content.innerHTML = `
      <div class="bg-brand-50/70 p-4 rounded-xl border border-brand-100 space-y-2">
        <div class="flex justify-between items-center text-sm font-semibold text-brand-900">
          <span>ประเภท: ${typeStr}</span>
          <span>ผู้อนุมัติ: ${approverStr}</span>
        </div>
        <div class="text-xs text-slate-700">
          <p><b>หน่วยงาน:</b> ${escapeHtml(data.department)}</p>
          <p><b>โครงการ/เหตุผล:</b> ${escapeHtml(data.project_name)}</p>
          ${data.doc_type === 'hire' ? `<p><b>ชื่องานที่จ้าง:</b> ${escapeHtml(data.hire_job_name)}</p>` : ''}
        </div>
      </div>

      <div class="space-y-1">
        <h4 class="font-bold text-slate-800 text-xs uppercase tracking-wider">ลำดับวันที่และเลขหนังสือราชการ (6 หน้า)</h4>
        <div class="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div><b>1. รายงานขอ:</b> ว/ด/ป ${data.doc1_date} (เลขที่ ${data.doc1_no})</div>
          <div><b>2. รายงานผล & ใบสั่ง:</b> ว/ด/ป ${data.doc2_date} (เลขที่ ${data.doc2_no}, ใบสั่ง ${data.po_no})</div>
          <div><b>3. กำหนดส่งมอบ:</b> ว/ด/ป ${data.delivery_due_date} (ภายใน ${data.delivery_days} วัน)</div>
          <div><b>4. ส่งมอบ & ตรวจรับ:</b> ว/ด/ป ${data.delivery_actual_date}</div>
          <div><b>5. ขออนุมัติจ่าย:</b> ว/ด/ป ${data.doc3_date} (เลขที่ ${data.doc3_no})</div>
          <div><b>เอกสารส่งมอบ:</b> ${data.receipt.type} เล่ม ${data.receipt.book_no} เลขที่ ${data.receipt.no}</div>
        </div>
      </div>

      <div class="space-y-1">
        <h4 class="font-bold text-slate-800 text-xs uppercase tracking-wider">คู่สัญญา / ผู้ขาย / ผู้รับจ้าง</h4>
        <div class="text-xs bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
          <p><b>ชื่อ:</b> ${escapeHtml(data.vendor.name)} (เลขภาษี: ${escapeHtml(data.vendor.tax_id)})</p>
          <p><b>ที่อยู่:</b> ${escapeHtml(data.vendor.address)} ต.${escapeHtml(data.vendor.subdistrict)} อ.${escapeHtml(data.vendor.district)} จ.${escapeHtml(data.vendor.province)} ${escapeHtml(data.vendor.zipcode)}</p>
          <p><b>ผู้ลงนาม:</b> ${escapeHtml(data.vendor.signer_name)} (${escapeHtml(data.vendor.signer_position)})</p>
        </div>
      </div>

      <div class="space-y-1">
        <h4 class="font-bold text-slate-800 text-xs uppercase tracking-wider">รายการและยอดรวม</h4>
        <table class="w-full text-left border-collapse bg-white rounded border border-slate-200">
          <thead>
            <tr class="bg-slate-100 text-slate-600 text-xs">
              <th class="py-1.5 px-2 text-center">#</th>
              <th class="py-1.5 px-2">รายการ</th>
              <th class="py-1.5 px-2 text-center">จำนวน</th>
              <th class="py-1.5 px-2 text-right">หน่วยละ</th>
              <th class="py-1.5 px-2 text-right">รวมเงิน</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot>
            <tr class="bg-slate-50 font-bold text-xs border-t">
              <td colspan="4" class="py-2 px-2 text-right">ยอดรวมทั้งสิ้น:</td>
              <td class="py-2 px-2 text-right font-mono text-brand-700">${totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="space-y-1">
        <h4 class="font-bold text-slate-800 text-xs uppercase tracking-wider">คณะกรรมการตรวจรับพัสดุ</h4>
        <div class="grid grid-cols-3 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
          ${data.committee.map((c, i) => `
            <div>
              <span class="text-slate-400 block">${i === 0 ? 'ประธาน' : 'กรรมการ'}:</span>
              <b>${escapeHtml(c.name)}</b>
              <span class="block text-slate-500">${escapeHtml(c.position)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    modalPreview.classList.remove('hidden');
  });

  // Modal Close buttons
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      modalDrafts.classList.add('hidden');
      modalVendors.classList.add('hidden');
      modalPreview.classList.add('hidden');
    });
  });

  // ----------------------------------------------------
  // Reset Form
  // ----------------------------------------------------
  btnResetForm.addEventListener('click', () => {
    if (confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลในฟอร์มทั้งหมด?')) {
      form.reset();
      itemsTableBody.innerHTML = '';
      createItemRow();
      if (presets && presets.today) {
        document.getElementById('doc1_date').value = presets.today.thai;
        autoCalculateDates();
      }
      showToast('ล้างฟอร์มเรียบร้อยแล้ว', 'info');
    }
  });

  // ----------------------------------------------------
  // Export Word (.docx)
  // ----------------------------------------------------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Check basic validity
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const docType = form.querySelector('input[name="doc_type"]:checked').value;
    if (docType === 'hire' && !hireJobInput.value.trim()) {
      showToast('กรุณาระบุชื่องานที่จะจ้าง', 'warning');
      hireJobInput.focus();
      return;
    }

    const payload = collectFormData();

    try {
      loadingOverlay.classList.remove('hidden');

      const response = await fetch('/api/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || `Export failed with status ${response.status}`);
      }

      // Download file blob
      const blob = await response.blob();

      // Auto-construct filename: "เหตุผลความจำเป็น_ชื่อร้านค้า_มูลค่าสินค้า"
      const reason = (payload.project_name || 'ชุดเบิก').trim();
      const vendor = (payload.vendor?.name || 'ร้านค้า').trim();
      const totalNum = payload.items.reduce((sum, it) => sum + (parseFloat(it.total_price) || 0), 0);
      const totalStr = Number.isInteger(totalNum) ? `${totalNum}บาท` : `${totalNum.toFixed(2)}บาท`;

      function cleanFilename(s) {
        return s.replace(/[\\/:*?"<>|\r\n\t]/g, '').trim().slice(0, 50);
      }

      let filename = `${cleanFilename(reason)}_${cleanFilename(vendor)}_${totalStr}.docx`;

      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition) {
        const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (utf8Match && utf8Match[1]) {
          try {
            filename = decodeURIComponent(utf8Match[1].trim());
          } catch (_) {}
        } else {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            try {
              filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, '').trim());
            } catch (_) {}
          }
        }
      }

      // Allow user to select save destination via File System Access API
      let savedViaPicker = false;
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'Microsoft Word Document (*.docx)',
              accept: {
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
              }
            }]
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          savedViaPicker = true;
          showToast(`บันทึกไฟล์เรียบร้อยที่: ${handle.name}`, 'success', 5000);
        } catch (pickerErr) {
          if (pickerErr.name === 'AbortError') {
            showToast('ยกเลิกการบันทึกไฟล์', 'info');
            return;
          }
          console.warn('File picker error, falling back to download:', pickerErr);
        }
      }

      if (!savedViaPicker) {
        const blobUrl = window.URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        window.URL.revokeObjectURL(blobUrl);
        showToast(`ส่งออกไฟล์สำเร็จ: ${filename}`, 'success', 5000);
      }

      // Auto-save to draft history
      try {
        await fetch('/api/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (_) {}

    } catch (err) {
      console.error(err);
      showToast(`เกิดข้อผิดพลาดในการสร้างไฟล์: ${err.message}`, 'error', 6000);
    } finally {
      loadingOverlay.classList.add('hidden');
    }
  });

  // Helper
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initialize
  loadPresets();
  loadGeography();
});

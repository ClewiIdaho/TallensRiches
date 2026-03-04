/* ============================================================
   Tallens Riches — Application Logic
   Vanilla JS · localStorage persistence · JSON import/export
   ============================================================ */

(function () {
  'use strict';

  // ---- Constants ----
  const STORAGE_KEY_INCOME = 'tallens_income';
  const STORAGE_KEY_BILLS  = 'tallens_bills';
  const STORAGE_KEY_FREQ   = 'tallens_freq';

  // ---- State ----
  let incomeEntries = loadJSON(STORAGE_KEY_INCOME, []);
  let billEntries   = loadJSON(STORAGE_KEY_BILLS, []);

  // ---- DOM References ----
  const $          = (sel) => document.querySelector(sel);
  const incomeForm = $('#incomeForm');
  const billForm   = $('#billForm');
  const incomeList = $('#incomeList');
  const billList   = $('#billList');
  const payFreq    = $('#payFrequency');
  const breakdown  = $('#payPeriodBreakdown');
  const timeline   = $('#billTimeline');
  const totalIncEl = $('#totalIncome');
  const totalBilEl = $('#totalBills');
  const remainEl   = $('#remaining');
  const modal      = $('#modal');
  const modalTitle = $('#modalTitle');
  const modalFields = $('#modalFields');
  const modalForm  = $('#modalForm');
  const btnDelete  = $('#btnModalDelete');
  const btnCancel  = $('#btnModalCancel');
  const btnExport  = $('#btnExport');
  const btnImport  = $('#btnImport');
  const fileImport = $('#fileImport');

  // ---- Helpers ----

  /** Load JSON from localStorage with a fallback default. */
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  /** Persist current state to localStorage. */
  function persist() {
    localStorage.setItem(STORAGE_KEY_INCOME, JSON.stringify(incomeEntries));
    localStorage.setItem(STORAGE_KEY_BILLS, JSON.stringify(billEntries));
    localStorage.setItem(STORAGE_KEY_FREQ, payFreq.value);
  }

  /** Format a number as USD currency string. */
  function usd(n) {
    return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Generate a simple unique id. */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** Parse a date string (YYYY-MM-DD) into a Date at local midnight. */
  function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /** Format a Date as "Mon DD, YYYY". */
  function fmtDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /** Format a Date as "Mon DD". */
  function fmtShort(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /** Return today at midnight. */
  function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Determine bill status relative to today.
   * "past-due"  — due date is before today
   * "due-soon"  — due within 3 days
   * "upcoming"  — otherwise
   */
  function billStatus(dueDateStr) {
    const due = parseDate(dueDateStr);
    const now = today();
    const diffMs = due - now;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return 'past-due';
    if (diffDays <= 3) return 'due-soon';
    return 'upcoming';
  }

  /** Human-readable status label. */
  function statusLabel(status) {
    if (status === 'past-due') return 'Past Due';
    if (status === 'due-soon') return 'Due Soon';
    return 'Upcoming';
  }

  // ---- Rendering ----

  /** Re-render all UI sections and persist state. */
  function render() {
    renderIncomeList();
    renderBillList();
    renderTimeline();
    renderBreakdown();
    renderSummary();
    persist();
  }

  /** Render income entries list. */
  function renderIncomeList() {
    if (incomeEntries.length === 0) {
      incomeList.innerHTML = '<li class="empty-state">No income added yet.</li>';
      return;
    }
    // Sort by date descending
    const sorted = [...incomeEntries].sort((a, b) => b.date.localeCompare(a.date));
    incomeList.innerHTML = sorted.map((e) => `
      <li class="entry-item" data-id="${e.id}" data-type="income">
        <div class="entry-info">
          <span class="entry-name">Paycheck</span>
          <span class="entry-meta">${fmtDate(parseDate(e.date))}</span>
        </div>
        <span class="entry-amount income">${usd(e.amount)}</span>
      </li>
    `).join('');
  }

  /** Render bill entries list. */
  function renderBillList() {
    if (billEntries.length === 0) {
      billList.innerHTML = '<li class="empty-state">No bills added yet.</li>';
      return;
    }
    const sorted = [...billEntries].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    billList.innerHTML = sorted.map((e) => {
      const status = billStatus(e.dueDate);
      return `
        <li class="entry-item" data-id="${e.id}" data-type="bill">
          <div class="entry-info">
            <span class="entry-name">${escapeHTML(e.name)}<span class="category-badge">${escapeHTML(e.category)}</span></span>
            <span class="entry-meta">${fmtDate(parseDate(e.dueDate))}</span>
          </div>
          <span class="entry-amount bill">${usd(e.amount)}</span>
        </li>`;
    }).join('');
  }

  /** Render the upcoming bills timeline with status indicators. */
  function renderTimeline() {
    if (billEntries.length === 0) {
      timeline.innerHTML = '<div class="empty-state">Add bills to see your timeline.</div>';
      return;
    }
    const sorted = [...billEntries].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    timeline.innerHTML = sorted.map((b) => {
      const status = billStatus(b.dueDate);
      return `
        <div class="timeline-item ${status}" data-id="${b.id}" data-type="bill">
          <div class="timeline-dot"></div>
          <div class="timeline-info">
            <div class="tl-name">${escapeHTML(b.name)}</div>
            <div class="tl-date">${fmtDate(parseDate(b.dueDate))}</div>
          </div>
          <span class="timeline-amount">${usd(b.amount)}</span>
          <span class="timeline-status">${statusLabel(status)}</span>
        </div>`;
    }).join('');
  }

  /**
   * Render pay-period breakdown.
   * Generates periods based on the chosen frequency, distributes income and
   * bills into each period, and shows a running remaining balance.
   */
  function renderBreakdown() {
    const freq = payFreq.value;
    const periods = generatePayPeriods(freq);

    if (periods.length === 0) {
      breakdown.innerHTML = '<div class="empty-state">Add income to see pay-period breakdown.</div>';
      return;
    }

    breakdown.innerHTML = periods.map((p, i) => {
      const periodIncome = p.income.reduce((s, e) => s + e.amount, 0);
      const periodBills  = p.bills.reduce((s, e) => s + e.amount, 0);
      const remaining    = periodIncome - periodBills;
      const pct          = periodIncome > 0 ? Math.min((remaining / periodIncome) * 100, 100) : 0;
      const isPositive   = remaining >= 0;

      // Build bill rows for detail view
      let runningBalance = periodIncome;
      const billRows = p.bills
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .map((b) => {
          runningBalance -= b.amount;
          return `
            <div class="period-bill-row">
              <span class="bill-label">${escapeHTML(b.name)} — ${fmtShort(parseDate(b.dueDate))}</span>
              <span class="bill-amt">-${usd(b.amount)}</span>
            </div>
            <div class="period-bill-remaining">
              <span>Remaining</span>
              <span style="color:${runningBalance >= 0 ? 'var(--green)' : 'var(--red)'}">${runningBalance >= 0 ? '' : '-'}${usd(runningBalance)}</span>
            </div>`;
        }).join('');

      return `
        <div class="pay-period-card" data-period="${i}">
          <div class="pay-period-header">
            <span class="period-dates">${fmtShort(p.start)} — ${fmtShort(p.end)}</span>
            <span class="period-income">+${usd(periodIncome)}</span>
          </div>
          <div class="pay-period-summary">
            <span>Bills: <span style="color:var(--red)">-${usd(periodBills)}</span></span>
            <span>Left: <span style="color:${isPositive ? 'var(--green)' : 'var(--red)'}">${isPositive ? '' : '-'}${usd(remaining)}</span></span>
          </div>
          <div class="remaining-bar">
            <div class="remaining-bar-fill ${isPositive ? 'positive' : 'negative'}" style="width:${Math.max(Math.abs(pct), 2)}%"></div>
          </div>
          <div class="pay-period-bills hidden">
            ${billRows || '<div class="empty-state">No bills in this period.</div>'}
          </div>
        </div>`;
    }).join('');
  }

  /**
   * Generate pay periods spanning the current month (and a bit beyond)
   * based on the selected frequency. Each period contains the income and
   * bill entries that fall within its date range.
   */
  function generatePayPeriods(freq) {
    if (incomeEntries.length === 0 && billEntries.length === 0) return [];

    // Determine the date range: earliest entry to latest + buffer
    const allDates = [
      ...incomeEntries.map((e) => e.date),
      ...billEntries.map((e) => e.dueDate)
    ].sort();

    if (allDates.length === 0) return [];

    let start = parseDate(allDates[0]);
    let end   = parseDate(allDates[allDates.length - 1]);

    // Extend end by at least one period so the last entry is covered
    const bufferDays = freq === 'weekly' ? 7 : freq === 'biweekly' ? 14 : 31;
    end = new Date(end.getTime() + bufferDays * 86400000);

    // Build period boundaries
    const periods = [];
    let cursor = new Date(start);

    while (cursor < end) {
      let periodEnd;
      if (freq === 'weekly') {
        periodEnd = new Date(cursor.getTime() + 6 * 86400000);
      } else if (freq === 'biweekly') {
        periodEnd = new Date(cursor.getTime() + 13 * 86400000);
      } else {
        // Monthly: same day next month - 1 day
        periodEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate() - 1);
      }

      const pStart = new Date(cursor);
      const pEnd   = new Date(periodEnd);

      // Collect income in range
      const income = incomeEntries.filter((e) => {
        const d = parseDate(e.date);
        return d >= pStart && d <= pEnd;
      });

      // Collect bills in range
      const bills = billEntries.filter((e) => {
        const d = parseDate(e.dueDate);
        return d >= pStart && d <= pEnd;
      });

      periods.push({ start: pStart, end: pEnd, income, bills });

      // Advance cursor
      if (freq === 'weekly') {
        cursor = new Date(cursor.getTime() + 7 * 86400000);
      } else if (freq === 'biweekly') {
        cursor = new Date(cursor.getTime() + 14 * 86400000);
      } else {
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
      }
    }

    return periods;
  }

  /** Render the summary bar totals. */
  function renderSummary() {
    const totalIncome = incomeEntries.reduce((s, e) => s + e.amount, 0);
    const totalBills  = billEntries.reduce((s, e) => s + e.amount, 0);
    const remaining   = totalIncome - totalBills;

    totalIncEl.textContent = usd(totalIncome);
    totalBilEl.textContent = usd(totalBills);
    remainEl.textContent   = (remaining >= 0 ? '' : '-') + usd(remaining);

    // Color the remaining value
    remainEl.style.color = remaining >= 0 ? 'var(--green)' : 'var(--red)';
    remainEl.style.textShadow = remaining >= 0
      ? '0 0 14px rgba(61,232,160,0.3)'
      : '0 0 14px rgba(255,79,110,0.3)';
  }

  /** Escape HTML to prevent XSS when inserting user-provided text. */
  function escapeHTML(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  // ---- CRUD Operations ----

  /** Add a new income entry. */
  function addIncome(amount, date) {
    incomeEntries.push({ id: uid(), amount: parseFloat(amount), date });
    render();
  }

  /** Add a new bill entry. */
  function addBill(name, amount, dueDate, category) {
    billEntries.push({ id: uid(), name, amount: parseFloat(amount), dueDate, category });
    render();
  }

  /** Update an existing income entry. */
  function updateIncome(id, amount, date) {
    const entry = incomeEntries.find((e) => e.id === id);
    if (!entry) return;
    entry.amount = parseFloat(amount);
    entry.date = date;
    render();
  }

  /** Update an existing bill entry. */
  function updateBill(id, name, amount, dueDate, category) {
    const entry = billEntries.find((e) => e.id === id);
    if (!entry) return;
    entry.name = name;
    entry.amount = parseFloat(amount);
    entry.dueDate = dueDate;
    entry.category = category;
    render();
  }

  /** Delete an income entry by id. */
  function deleteIncome(id) {
    incomeEntries = incomeEntries.filter((e) => e.id !== id);
    render();
  }

  /** Delete a bill entry by id. */
  function deleteBill(id) {
    billEntries = billEntries.filter((e) => e.id !== id);
    render();
  }

  // ---- Modal ----

  let modalState = { type: null, id: null };

  /** Open the edit/delete modal for an entry. */
  function openModal(type, id) {
    modalState = { type, id };
    modal.hidden = false;

    if (type === 'income') {
      const entry = incomeEntries.find((e) => e.id === id);
      if (!entry) return;
      modalTitle.textContent = 'Edit Income';
      modalFields.innerHTML = `
        <div class="form-row">
          <label for="modalAmount">Amount ($)</label>
          <input type="number" id="modalAmount" value="${entry.amount}" step="0.01" min="0" required>
        </div>
        <div class="form-row">
          <label for="modalDate">Date Received</label>
          <input type="date" id="modalDate" value="${entry.date}" required>
        </div>`;
    } else {
      const entry = billEntries.find((e) => e.id === id);
      if (!entry) return;
      modalTitle.textContent = 'Edit Bill';
      const categories = ['Housing','Utilities','Transportation','Insurance','Food','Entertainment','Subscriptions','Debt','Other'];
      const opts = categories.map((c) => `<option value="${c}" ${c === entry.category ? 'selected' : ''}>${c}</option>`).join('');
      modalFields.innerHTML = `
        <div class="form-row">
          <label for="modalName">Bill Name</label>
          <input type="text" id="modalName" value="${escapeHTML(entry.name)}" required>
        </div>
        <div class="form-row">
          <label for="modalAmount">Amount ($)</label>
          <input type="number" id="modalAmount" value="${entry.amount}" step="0.01" min="0" required>
        </div>
        <div class="form-row">
          <label for="modalDueDate">Due Date</label>
          <input type="date" id="modalDueDate" value="${entry.dueDate}" required>
        </div>
        <div class="form-row">
          <label for="modalCategory">Category</label>
          <select id="modalCategory">${opts}</select>
        </div>`;
    }
  }

  /** Close the modal. */
  function closeModal() {
    modal.hidden = true;
    modalState = { type: null, id: null };
  }

  // ---- Event Listeners ----

  // Add income
  incomeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = document.getElementById('incomeAmount').value;
    const date   = document.getElementById('incomeDate').value;
    if (!amount || !date) return;
    addIncome(amount, date);
    incomeForm.reset();
  });

  // Add bill
  billForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name     = document.getElementById('billName').value.trim();
    const amount   = document.getElementById('billAmount').value;
    const dueDate  = document.getElementById('billDueDate').value;
    const category = document.getElementById('billCategory').value;
    if (!name || !amount || !dueDate) return;
    addBill(name, amount, dueDate, category);
    billForm.reset();
  });

  // Click on an entry item → open modal
  document.addEventListener('click', (e) => {
    const item = e.target.closest('[data-id][data-type]');
    if (!item) return;
    openModal(item.dataset.type, item.dataset.id);
  });

  // Click on pay-period card → toggle bill details
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.pay-period-card');
    if (!card) return;
    // Don't toggle if the click was on a bill item inside the card
    if (e.target.closest('[data-id]')) return;
    const detail = card.querySelector('.pay-period-bills');
    if (detail) {
      detail.classList.toggle('hidden');
      card.classList.toggle('expanded');
    }
  });

  // Modal form submit → save edits
  modalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const { type, id } = modalState;
    if (type === 'income') {
      updateIncome(
        id,
        document.getElementById('modalAmount').value,
        document.getElementById('modalDate').value
      );
    } else {
      updateBill(
        id,
        document.getElementById('modalName').value.trim(),
        document.getElementById('modalAmount').value,
        document.getElementById('modalDueDate').value,
        document.getElementById('modalCategory').value
      );
    }
    closeModal();
  });

  // Modal delete button
  btnDelete.addEventListener('click', () => {
    const { type, id } = modalState;
    if (type === 'income') deleteIncome(id);
    else deleteBill(id);
    closeModal();
  });

  // Modal cancel / overlay click
  btnCancel.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  // Pay frequency change
  payFreq.addEventListener('change', () => {
    render();
  });

  // Restore saved frequency preference
  const savedFreq = localStorage.getItem(STORAGE_KEY_FREQ);
  if (savedFreq) payFreq.value = savedFreq;

  // ---- Export / Import ----

  /** Export all data as a downloadable JSON file. */
  btnExport.addEventListener('click', () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      payFrequency: payFreq.value,
      income: incomeEntries,
      bills: billEntries
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `tallens-riches-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  /** Trigger file picker for import. */
  btnImport.addEventListener('click', () => fileImport.click());

  /** Read and apply imported JSON backup. */
  fileImport.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!data.income || !data.bills) {
          alert('Invalid backup file. Missing income or bills data.');
          return;
        }
        incomeEntries = data.income;
        billEntries   = data.bills;
        if (data.payFrequency) payFreq.value = data.payFrequency;
        render();
        alert('Backup loaded successfully!');
      } catch {
        alert('Failed to parse backup file. Please check the file format.');
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    fileImport.value = '';
  });

  // ---- Initial Render ----
  render();

})();

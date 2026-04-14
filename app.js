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
  const $           = (sel) => document.querySelector(sel);
  const incomeForm  = $('#incomeForm');
  const billForm    = $('#billForm');
  const incomeList  = $('#incomeList');
  const billList    = $('#billList');
  const payFreq     = $('#payFrequency');
  const paycheckBD  = $('#paycheckBreakdown');
  const breakdown   = $('#payPeriodBreakdown');
  const timeline    = $('#billTimeline');
  const totalIncEl  = $('#totalIncome');
  const totalBilEl  = $('#totalBills');
  const remainEl    = $('#remaining');
  const modal       = $('#modal');
  const modalTitle  = $('#modalTitle');
  const modalFields = $('#modalFields');
  const modalForm   = $('#modalForm');
  const btnDelete   = $('#btnModalDelete');
  const btnCancel   = $('#btnModalCancel');
  const btnExport   = $('#btnExport');
  const btnImport   = $('#btnImport');
  const fileImport  = $('#fileImport');

  // ---- Helpers ----

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY_INCOME, JSON.stringify(incomeEntries));
    localStorage.setItem(STORAGE_KEY_BILLS,  JSON.stringify(billEntries));
    localStorage.setItem(STORAGE_KEY_FREQ,   payFreq.value);
  }

  function usd(n) {
    return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function fmtDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtShort(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function billStatus(dueDateStr) {
    const due     = parseDate(dueDateStr);
    const now     = today();
    const diffMs  = due - now;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays < 0)  return 'past-due';
    if (diffDays <= 3) return 'due-soon';
    return 'upcoming';
  }

  function statusLabel(status) {
    if (status === 'past-due') return 'Past Due';
    if (status === 'due-soon') return 'Due Soon';
    return 'Upcoming';
  }

  function escapeHTML(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  // ---- Rendering ----

  function render() {
    renderIncomeList();
    renderBillList();
    renderTimeline();
    renderPaycheckBreakdown();
    renderBreakdown();
    renderSummary();
    persist();
  }

  function renderIncomeList() {
    if (incomeEntries.length === 0) {
      incomeList.innerHTML = '<li class="empty-state">No income added yet.</li>';
      return;
    }
    const sorted = [...incomeEntries].sort((a, b) => b.date.localeCompare(a.date));
    incomeList.innerHTML = sorted.map((e) => `
      <li class="entry-item" data-id="${e.id}" data-type="income">
        <div class="entry-info">
          <span class="entry-name">Paycheck</span>
          <span class="entry-meta">${fmtDate(parseDate(e.date))}</span>
        </div>
        <span class="entry-amount income">${usd(e.amount)}</span>
        <button class="delete-btn" data-delete-id="${e.id}" data-delete-type="income" title="Delete">&times;</button>
      </li>
    `).join('');
  }

  /** Build a single bill row — used in both Unpaid and Paid sections. */
  function buildBillRow(e) {
    const isPaid = e.paid === true;
    return `
      <li class="entry-item${isPaid ? ' bill-paid' : ''}" data-id="${e.id}" data-type="bill">
        <div class="entry-info">
          <span class="entry-name">${escapeHTML(e.name)}<span class="category-badge">${escapeHTML(e.category)}</span></span>
          <span class="entry-meta">${fmtDate(parseDate(e.dueDate))}</span>
        </div>
        <span class="entry-amount bill">${usd(e.amount)}</span>
        <button
          class="paid-toggle-btn ${isPaid ? 'state-paid' : 'state-unpaid'}"
          data-paid-id="${e.id}"
          title="${isPaid ? 'Click to mark Unpaid' : 'Click to mark Paid'}"
        >${isPaid ? '✓ Paid' : 'Unpaid'}</button>
        <button class="delete-btn" data-delete-id="${e.id}" data-delete-type="bill" title="Delete">&times;</button>
      </li>`;
  }

  /** Render bills split into Unpaid / Paid sections. */
  function renderBillList() {
    if (billEntries.length === 0) {
      billList.innerHTML = '<div class="empty-state">No bills added yet.</div>';
      return;
    }

    const sorted   = [...billEntries].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const unpaid   = sorted.filter((e) => !e.paid);
    const paid     = sorted.filter((e) => e.paid);

    let html = '';

    // ---- Unpaid section ----
    html += `<div class="bill-section">
      <div class="bill-section-header unpaid-header">
        <span class="section-dot dot-unpaid"></span>
        Unpaid
        <span class="section-count">${unpaid.length}</span>
      </div>
      <ul class="entry-list">
        ${unpaid.length
          ? unpaid.map(buildBillRow).join('')
          : '<li class="empty-state">No unpaid bills.</li>'}
      </ul>
    </div>`;

    // ---- Paid section ----
    html += `<div class="bill-section">
      <div class="bill-section-header paid-header">
        <span class="section-dot dot-paid"></span>
        Paid
        <span class="section-count">${paid.length}</span>
      </div>
      <ul class="entry-list">
        ${paid.length
          ? paid.map(buildBillRow).join('')
          : '<li class="empty-state">No paid bills yet.</li>'}
      </ul>
    </div>`;

    billList.innerHTML = html;
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
      const isPaid = b.paid === true;
      return `
        <div class="timeline-item ${isPaid ? 'timeline-paid' : status}" data-id="${b.id}" data-type="bill">
          <div class="timeline-dot"></div>
          <div class="timeline-info">
            <div class="tl-name${isPaid ? ' tl-paid-name' : ''}">${escapeHTML(b.name)}</div>
            <div class="tl-date">${fmtDate(parseDate(b.dueDate))}</div>
          </div>
          <span class="timeline-amount">${usd(b.amount)}</span>
          ${isPaid
            ? '<span class="timeline-paid-badge">✓ Paid</span>'
            : `<span class="timeline-status">${statusLabel(status)}</span>`}
        </div>`;
    }).join('');
  }

  /** Render paycheck breakdown waterfall visual. */
  function renderPaycheckBreakdown() {
    const totalIncome = incomeEntries.reduce((s, e) => s + e.amount, 0);

    if (totalIncome === 0) {
      paycheckBD.innerHTML = '<div class="empty-state">Add income to see your paycheck breakdown.</div>';
      return;
    }
    if (billEntries.length === 0) {
      paycheckBD.innerHTML = '<div class="empty-state">Add bills to see deductions from your paycheck.</div>';
      return;
    }

    const totalBills  = billEntries.reduce((s, e) => s + e.amount, 0);
    const sorted      = [...billEntries].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    function barColor(pct) {
      if (pct > 60) return 'var(--green)';
      if (pct > 30) return 'var(--yellow)';
      return 'var(--red)';
    }

    let running = totalIncome;
    let html = '';

    // Header — paycheck total
    html += `
      <div class="pcb-header">
        <div class="pcb-paycheck-label">Your Paycheck</div>
        <div class="pcb-paycheck-amount">${usd(totalIncome)}</div>
        <div class="pcb-bar pcb-bar-full">
          <div class="pcb-bar-fill" style="width:100%;background:var(--green)"></div>
        </div>
      </div>`;

    // Deduction rows
    html += '<div class="pcb-deductions">';
    sorted.forEach((bill) => {
      running -= bill.amount;
      const remainPct = Math.max((running / totalIncome) * 100, 0);
      const color     = running >= 0 ? barColor(remainPct) : 'var(--red)';
      const isPaid    = bill.paid === true;

      html += `
        <div class="pcb-row${isPaid ? ' pcb-row-paid' : ''}">
          <div class="pcb-row-top">
            <span class="pcb-bill-name">${escapeHTML(bill.name)}<span class="category-badge">${escapeHTML(bill.category)}</span></span>
            <span class="pcb-deduct">-${usd(bill.amount)}</span>
          </div>
          <div class="pcb-bar">
            <div class="pcb-bar-fill" style="width:${remainPct}%;background:${color}"></div>
          </div>
          <div class="pcb-row-bottom">
            <span style="color:${running >= 0 ? color : 'var(--red)'}">
              ${running >= 0 ? '' : '-'}${usd(running)} remaining
            </span>
          </div>
        </div>`;
    });
    html += '</div>';

    // Footer summary
    const finalRemaining = totalIncome - totalBills;
    const spentPct = Math.min((totalBills / totalIncome) * 100, 100);

    html += `
      <div class="pcb-footer">
        <div class="pcb-footer-row">
          <div class="pcb-stat">
            <span class="pcb-stat-label">Total Spent</span>
            <span class="pcb-stat-value" style="color:var(--red)">${usd(totalBills)}</span>
            <span class="pcb-stat-pct">${spentPct.toFixed(0)}%</span>
          </div>
          <div class="pcb-stat">
            <span class="pcb-stat-label">Remaining</span>
            <span class="pcb-stat-value" style="color:${finalRemaining >= 0 ? 'var(--green)' : 'var(--red)'}">${finalRemaining >= 0 ? '' : '-'}${usd(finalRemaining)}</span>
            <span class="pcb-stat-pct">${Math.max(100 - spentPct, 0).toFixed(0)}%</span>
          </div>
        </div>
      </div>`;

    paycheckBD.innerHTML = html;
  }

  /** Render pay-period breakdown. */
  function renderBreakdown() {
    const freq    = payFreq.value;
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

      let runningBalance = periodIncome;
      const billRows = p.bills
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .map((b) => {
          runningBalance -= b.amount;
          const isPaid = b.paid === true;
          return `
            <div class="period-bill-row${isPaid ? ' period-bill-paid' : ''}">
              <span class="bill-label">
                ${escapeHTML(b.name)} — ${fmtShort(parseDate(b.dueDate))}
                ${isPaid ? '<span class="period-paid-tag">Paid</span>' : ''}
              </span>
              <span class="bill-amt">-${usd(b.amount)}</span>
            </div>
            <div class="period-bill-remaining">
              <span>Remaining</span>
              <span style="color:${runningBalance >= 0 ? 'var(--green)' : 'var(--red)'}">
                ${runningBalance >= 0 ? '' : '-'}${usd(runningBalance)}
              </span>
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
            <span>Left: <span style="color:${isPositive ? 'var(--green)' : 'var(--red)'}">
              ${isPositive ? '' : '-'}${usd(remaining)}
            </span></span>
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

  function generatePayPeriods(freq) {
    if (incomeEntries.length === 0 && billEntries.length === 0) return [];

    const allDates = [
      ...incomeEntries.map((e) => e.date),
      ...billEntries.map((e) => e.dueDate)
    ].sort();

    if (allDates.length === 0) return [];

    let start = parseDate(allDates[0]);
    let end   = parseDate(allDates[allDates.length - 1]);

    const bufferDays = freq === 'weekly' ? 7 : freq === 'biweekly' ? 14 : 31;
    end = new Date(end.getTime() + bufferDays * 86400000);

    const periods = [];
    let cursor = new Date(start);

    while (cursor < end) {
      let periodEnd;
      if (freq === 'weekly') {
        periodEnd = new Date(cursor.getTime() + 6 * 86400000);
      } else if (freq === 'biweekly') {
        periodEnd = new Date(cursor.getTime() + 13 * 86400000);
      } else {
        periodEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate() - 1);
      }

      const pStart = new Date(cursor);
      const pEnd   = new Date(periodEnd);

      const income = incomeEntries.filter((e) => {
        const d = parseDate(e.date);
        return d >= pStart && d <= pEnd;
      });
      const bills = billEntries.filter((e) => {
        const d = parseDate(e.dueDate);
        return d >= pStart && d <= pEnd;
      });

      periods.push({ start: pStart, end: pEnd, income, bills });

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

  function renderSummary() {
    const totalIncome = incomeEntries.reduce((s, e) => s + e.amount, 0);
    const totalBills  = billEntries.reduce((s, e) => s + e.amount, 0);
    const remaining   = totalIncome - totalBills;

    totalIncEl.textContent = usd(totalIncome);
    totalBilEl.textContent = usd(totalBills);
    remainEl.textContent   = (remaining >= 0 ? '' : '-') + usd(remaining);
    remainEl.style.color   = remaining >= 0 ? 'var(--green)' : 'var(--red)';
    remainEl.style.textShadow = remaining >= 0
      ? '0 0 14px rgba(61,232,160,0.3)'
      : '0 0 14px rgba(255,79,110,0.3)';
  }

  // ---- CRUD ----

  function addIncome(amount, date) {
    incomeEntries.push({ id: uid(), amount: parseFloat(amount), date });
    render();
  }

  function addBill(name, amount, dueDate, category) {
    billEntries.push({ id: uid(), name, amount: parseFloat(amount), dueDate, category, paid: false });
    render();
  }

  function updateIncome(id, amount, date) {
    const entry = incomeEntries.find((e) => e.id === id);
    if (!entry) return;
    entry.amount = parseFloat(amount);
    entry.date   = date;
    render();
  }

  function updateBill(id, name, amount, dueDate, category) {
    const entry = billEntries.find((e) => e.id === id);
    if (!entry) return;
    entry.name    = name;
    entry.amount  = parseFloat(amount);
    entry.dueDate = dueDate;
    entry.category = category;
    render();
  }

  function deleteIncome(id) {
    incomeEntries = incomeEntries.filter((e) => e.id !== id);
    render();
  }

  function deleteBill(id) {
    billEntries = billEntries.filter((e) => e.id !== id);
    render();
  }

  function toggleBillPaid(id) {
    const entry = billEntries.find((e) => e.id === id);
    if (!entry) return;
    entry.paid = !entry.paid;
    render();
  }

  // ---- Modal ----

  let modalState = { type: null, id: null };

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
      const opts = categories.map((c) =>
        `<option value="${c}" ${c === entry.category ? 'selected' : ''}>${c}</option>`
      ).join('');
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

  function closeModal() {
    modal.hidden = true;
    modalState = { type: null, id: null };
  }

  // ---- Event Listeners ----

  incomeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = document.getElementById('incomeAmount').value;
    const date   = document.getElementById('incomeDate').value;
    if (!amount || !date) return;
    addIncome(amount, date);
    incomeForm.reset();
  });

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

  // Delete button
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-btn');
    if (!btn) return;
    e.stopPropagation();
    const id   = btn.dataset.deleteId;
    const type = btn.dataset.deleteType;
    if (type === 'income') deleteIncome(id);
    else deleteBill(id);
  });

  // Paid/Unpaid toggle button
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.paid-toggle-btn');
    if (!btn) return;
    e.stopPropagation();
    toggleBillPaid(btn.dataset.paidId);
  });

  // Click entry → open modal (skip delete + paid button clicks)
  document.addEventListener('click', (e) => {
    if (e.target.closest('.delete-btn'))      return;
    if (e.target.closest('.paid-toggle-btn')) return;
    const item = e.target.closest('[data-id][data-type]');
    if (!item) return;
    openModal(item.dataset.type, item.dataset.id);
  });

  // Pay-period card expand/collapse
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.pay-period-card');
    if (!card) return;
    if (e.target.closest('[data-id]')) return;
    const detail = card.querySelector('.pay-period-bills');
    if (detail) {
      detail.classList.toggle('hidden');
      card.classList.toggle('expanded');
    }
  });

  // Modal save
  modalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const { type, id } = modalState;
    if (type === 'income') {
      updateIncome(id, document.getElementById('modalAmount').value, document.getElementById('modalDate').value);
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

  btnDelete.addEventListener('click', () => {
    const { type, id } = modalState;
    if (type === 'income') deleteIncome(id);
    else deleteBill(id);
    closeModal();
  });

  btnCancel.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  payFreq.addEventListener('change', render);

  const savedFreq = localStorage.getItem(STORAGE_KEY_FREQ);
  if (savedFreq) payFreq.value = savedFreq;

  // ---- Export / Import ----

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

  btnImport.addEventListener('click', () => fileImport.click());

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
    fileImport.value = '';
  });

  // ---- Initial Render ----
  render();

})();

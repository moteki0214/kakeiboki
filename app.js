/* ============================================
   カケイボキ — Application Logic
   ============================================ */

// ===== 勘定科目マスタ (科目ID番号体系) =====
const DEFAULT_ACCOUNTS = [
    { id: '1101', name: '現金', type: 'asset' },
    { id: '1102', name: '普通預金', type: 'asset' },
    { id: '1103', name: '電子マネー', type: 'asset' },
    { id: '1201', name: '建物・設備', type: 'asset' },
    { id: '2101', name: 'クレジットカード', type: 'liability' },
    { id: '2201', name: '長期借入金', type: 'liability' },
    { id: '3101', name: '元入金', type: 'equity' },
    { id: '4101', name: '給与収入', type: 'income' },
    { id: '4102', name: '副業収入', type: 'income' },
    { id: '4103', name: 'その他収入', type: 'income' },
    { id: '5101', name: '食費', type: 'expense' },
    { id: '5102', name: '住居費', type: 'expense' },
    { id: '5103', name: '水道光熱費', type: 'expense' },
    { id: '5104', name: '通信費', type: 'expense' },
    { id: '5105', name: '交通費', type: 'expense' },
    { id: '5106', name: '日用品費', type: 'expense' },
    { id: '5107', name: '医療費', type: 'expense' },
    { id: '5108', name: '娯楽費', type: 'expense' },
    { id: '5109', name: '被服費', type: 'expense' },
    { id: '5110', name: '教育費', type: 'expense' },
    { id: '5111', name: '交際費', type: 'expense' },
    { id: '5112', name: 'その他支出', type: 'expense' },
];

const TYPE_LABELS = { asset: '資産', liability: '負債', equity: '純資産', income: '収益', expense: '費用' };
const TYPE_CSS = { asset: 'type-asset', liability: 'type-liability', equity: 'type-equity', income: 'type-income', expense: 'type-expense' };

// ===== データ管理 =====
class DataStore {
    constructor() {
        this.accounts = JSON.parse(localStorage.getItem('kakeibo_accounts')) || [...DEFAULT_ACCOUNTS];
        this.journals = JSON.parse(localStorage.getItem('kakeibo_journals')) || [];
        this.dictionaries = JSON.parse(localStorage.getItem('kakeibo_dictionaries')) || [];
        this.dictSortOrder = localStorage.getItem('kakeibo_dict_sort') || 'name_asc';
        this.userId = null;
        this.unsubscribe = null;
    }
    save() {
        localStorage.setItem('kakeibo_accounts', JSON.stringify(this.accounts));
        localStorage.setItem('kakeibo_journals', JSON.stringify(this.journals));
        localStorage.setItem('kakeibo_dictionaries', JSON.stringify(this.dictionaries));
        localStorage.setItem('kakeibo_dict_sort', this.dictSortOrder);
        this.syncToFirestore();
    }
    async syncToFirestore() {
        if (!this.userId || typeof db === 'undefined') return;
        setSyncStatus('syncing');
        try {
            await db.collection('users').doc(this.userId).set({
                accounts: this.accounts,
                journals: this.journals,
                dictionaries: this.dictionaries,
                dictSortOrder: this.dictSortOrder,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            setSyncStatus('synced');
        } catch (error) {
            console.error("Firestore sync error:", error);
            setSyncStatus('error');
        }
    }
    startRealtimeSync(uid) {
        this.userId = uid;
        if (typeof db === 'undefined') return;
        setSyncStatus('syncing');
        this.unsubscribe = db.collection('users').doc(uid).onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                if (data.accounts) this.accounts = data.accounts;
                if (data.journals) {
                    this.journals = data.journals;
                    this.journals.sort((a, b) => String(a.date).localeCompare(String(b.date)));
                }
                if (data.dictionaries) this.dictionaries = data.dictionaries;
                if (data.dictSortOrder) this.dictSortOrder = data.dictSortOrder;
                
                localStorage.setItem('kakeibo_accounts', JSON.stringify(this.accounts));
                localStorage.setItem('kakeibo_journals', JSON.stringify(this.journals));
                localStorage.setItem('kakeibo_dictionaries', JSON.stringify(this.dictionaries));
                localStorage.setItem('kakeibo_dict_sort', this.dictSortOrder);
                
                populateAllSelects();
                populateDictionarySelect();
                const activeBtn = document.querySelector('.nav-btn.active');
                if (activeBtn) {
                    const activeTab = activeBtn.dataset.tab;
                    if (activeTab === 'journal') renderJournal();
                    if (activeTab === 'ledger') renderLedger();
                    if (activeTab === 'balance-sheet') renderBalanceSheet();
                    if (activeTab === 'income-statement') renderIncomeStatement();
                    if (activeTab === 'accounts') renderAccounts();
                    if (activeTab === 'dictionary') renderDictionaries();
                }
                setSyncStatus('synced');
            } else {
                this.syncToFirestore();
            }
        }, err => {
            console.error("Sync listener error:", err);
            setSyncStatus('error');
        });
    }
    stopRealtimeSync() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        this.userId = null;
        setSyncStatus('local');
    }
    addJournal(entry) {
        entry.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        this.journals.push(entry);
        this.journals.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        this.save();
        return entry;
    }
    deleteJournal(id) {
        this.journals = this.journals.filter(j => j.id !== id);
        this.save();
    }
    updateJournal(id, updates) {
        const journal = this.journals.find(j => j.id === id);
        if (!journal) return false;
        Object.assign(journal, updates);
        this.journals.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        this.save();
        return true;
    }
    getAccount(id) { return this.accounts.find(a => String(a.id) === String(id)); }
    getAccountsByType(type) { 
        return this.accounts
            .filter(a => a.type === type)
            .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
    }
    addAccount(account) {
        if (this.accounts.some(a => String(a.id) === String(account.id))) return false;
        this.accounts.push(account);
        this.accounts.sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
        this.save();
        return true;
    }
    updateAccount(id, updates) {
        const acct = this.getAccount(id);
        if (!acct) return false;
        if (updates.id !== undefined && String(updates.id) !== String(id)) {
            const newId = String(updates.id);
            if (this.accounts.some(a => String(a.id) === newId)) return 'duplicate';
            for (const j of this.journals) {
                for (const d of j.debits) if (String(d.accountId) === String(id)) d.accountId = newId;
                for (const c of j.credits) if (String(c.accountId) === String(id)) c.accountId = newId;
            }
            for (const d of this.dictionaries) {
                for (const db of d.debits) if (String(db.accountId) === String(id)) db.accountId = newId;
                for (const cr of d.credits) if (String(cr.accountId) === String(id)) cr.accountId = newId;
            }
            acct.id = newId;
        }
        if (updates.name !== undefined) acct.name = updates.name;
        if (updates.type !== undefined) acct.type = updates.type;
        this.accounts.sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
        this.save();
        return true;
    }
    deleteAccount(id) {
        if (this.isAccountUsed(id)) return false;
        this.accounts = this.accounts.filter(a => String(a.id) !== String(id));
        this.save();
        return true;
    }
    isAccountUsed(id) {
        return this.journals.some(j =>
            j.debits.some(d => String(d.accountId) === String(id)) ||
            j.credits.some(c => String(c.accountId) === String(id))
        );
    }
    resetAccounts() {
        this.accounts = [...DEFAULT_ACCOUNTS];
        this.save();
    }
    getFilteredJournals(from, to, keyword) {
        return this.journals.filter(j => {
            if (from && j.date < from) return false;
            if (to && j.date > to) return false;
            if (keyword && !j.description.includes(keyword)) return false;
            return true;
        });
    }
    getBalance(accountId, upToDate) {
        let balance = 0;
        const acct = this.getAccount(accountId);
        if (!acct) return 0;
        const isDebitNormal = acct.type === 'asset' || acct.type === 'expense';
        for (const j of this.journals) {
            if (upToDate && j.date > upToDate) continue;
            for (const d of j.debits) {
                if (String(d.accountId) === String(accountId)) balance += isDebitNormal ? d.amount : -d.amount;
            }
            for (const c of j.credits) {
                if (String(c.accountId) === String(accountId)) balance += isDebitNormal ? -c.amount : c.amount;
            }
        }
        return balance;
    }
    // ===== 仕訳辞書 =====
    addDictionary(template) {
        template.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        template.createdAt = Date.now();
        this.dictionaries.push(template);
        this.save();
        return template;
    }
    updateDictionary(id, updates) {
        const dict = this.dictionaries.find(d => d.id === id);
        if (!dict) return false;
        Object.assign(dict, updates);
        this.save();
        return true;
    }
    deleteDictionary(id) {
        this.dictionaries = this.dictionaries.filter(d => d.id !== id);
        this.save();
    }
    getSortedDictionaries() {
        const list = [...this.dictionaries];
        if (this.dictSortOrder === 'name_asc') {
            list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        } else if (this.dictSortOrder === 'name_desc') {
            list.sort((a, b) => b.name.localeCompare(a.name, 'ja'));
        } else if (this.dictSortOrder === 'date_desc') {
            list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        } else if (this.dictSortOrder === 'date_asc') {
            list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        }
        return list;
    }
}

const store = new DataStore();

// ===== ユーティリティ =====
function formatCurrency(amount) {
    return '¥' + Math.abs(amount).toLocaleString('ja-JP');
}
function formatDate(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[0]}/${parts[1]}/${parts[2]}`;
    }
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
function getTodayString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ===== ナビゲーション =====
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        const tab = document.getElementById(btn.dataset.tab);
        tab.classList.add('active');
        if (btn.dataset.tab === 'journal') renderJournal();
        if (btn.dataset.tab === 'ledger') renderLedger();
        if (btn.dataset.tab === 'balance-sheet') renderBalanceSheet();
        if (btn.dataset.tab === 'income-statement') renderIncomeStatement();
        if (btn.dataset.tab === 'accounts') renderAccounts();
        if (btn.dataset.tab === 'dictionary') renderDictionaries();
    });
});

// ===== ヘッダー日付 =====
function updateHeaderDate() {
    const now = new Date();
    const opts = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    document.getElementById('headerDate').textContent = now.toLocaleDateString('ja-JP', opts);
}
updateHeaderDate();

// ===== 勘定科目セレクトボックス =====
function populateAccountSelect(selectEl) {
    const current = selectEl.value;
    selectEl.innerHTML = '<option value="">勘定科目を選択</option>';
    const types = ['asset', 'liability', 'equity', 'income', 'expense'];
    for (const type of types) {
        const accts = store.getAccountsByType(type);
        if (accts.length === 0) continue;
        const optgroup = document.createElement('optgroup');
        optgroup.label = TYPE_LABELS[type];
        for (const a of accts) {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = `${a.id} ${a.name}`;
            optgroup.appendChild(opt);
        }
        selectEl.appendChild(optgroup);
    }
    if (current) selectEl.value = current;
}

function populateAllSelects() {
    document.querySelectorAll('.account-select').forEach(populateAccountSelect);
    const ledgerSel = document.getElementById('ledgerAccount');
    if (ledgerSel) {
        const cur = ledgerSel.value;
        ledgerSel.innerHTML = '<option value="">すべて</option>';
        const allAccts = [...store.accounts].sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
        for (const acct of allAccts) {
            const opt = document.createElement('option');
            opt.value = acct.id;
            opt.textContent = `${acct.id} ${acct.name}（${TYPE_LABELS[acct.type]}）`;
            ledgerSel.appendChild(opt);
        }
        if (cur) ledgerSel.value = cur;
    }
}
populateAllSelects();

// ===== 仕訳入力 =====
const entryForm = document.getElementById('entryForm');
const debitLines = document.getElementById('debitLines');
const creditLines = document.getElementById('creditLines');
let currentEditingJournalId = null;
let currentEditingDictId = null;

function createEntryLine(side) {
    const line = document.createElement('div');
    line.className = 'entry-line';
    line.innerHTML = `
        <select class="account-select" data-side="${side}" required>
            <option value="">勘定科目を選択</option>
        </select>
        <input type="number" class="amount-input" data-side="${side}" placeholder="金額" min="0" required>
        <button type="button" class="btn-remove-line" title="削除">✕</button>
    `;
    populateAccountSelect(line.querySelector('select'));
    line.querySelector('.btn-remove-line').addEventListener('click', () => {
        line.remove();
        updateRemoveButtons();
        updateBalance();
    });
    line.querySelector('.amount-input').addEventListener('input', updateBalance);
    return line;
}

function updateRemoveButtons() {
    [debitLines, creditLines].forEach(container => {
        const lines = container.querySelectorAll('.entry-line');
        lines.forEach(l => {
            const btn = l.querySelector('.btn-remove-line');
            btn.style.visibility = lines.length > 1 ? 'visible' : 'hidden';
        });
    });
}

document.getElementById('addDebitLine').addEventListener('click', () => {
    debitLines.appendChild(createEntryLine('debit'));
    updateRemoveButtons();
});
document.getElementById('addCreditLine').addEventListener('click', () => {
    creditLines.appendChild(createEntryLine('credit'));
    updateRemoveButtons();
});

function getTotal(side) {
    let total = 0;
    document.querySelectorAll(`.amount-input[data-side="${side}"]`).forEach(inp => {
        total += parseFloat(inp.value) || 0;
    });
    return total;
}

function updateBalance() {
    const debit = getTotal('debit');
    const credit = getTotal('credit');
    document.getElementById('debitTotal').textContent = formatCurrency(debit);
    document.getElementById('creditTotal').textContent = formatCurrency(credit);
    const check = document.getElementById('balanceCheck');
    const submitBtn = document.getElementById('submitBtn');
    check.classList.remove('balanced', 'unbalanced');
    if (debit > 0 && credit > 0) {
        if (debit === credit) {
            check.classList.add('balanced');
            submitBtn.disabled = false;
        } else {
            check.classList.add('unbalanced');
            submitBtn.disabled = true;
        }
    } else {
        submitBtn.disabled = true;
    }
}

// フォームリセット（競合を防ぐため個別初期化と確実な行再生成）
function resetEntryForm() {
    document.getElementById('entryDate').value = getTodayString();
    document.getElementById('entryDescription').value = '';
    const dictSel = document.getElementById('dictionarySelect');
    if (dictSel) dictSel.value = '';

    debitLines.innerHTML = '';
    creditLines.innerHTML = '';
    debitLines.appendChild(createEntryLine('debit'));
    creditLines.appendChild(createEntryLine('credit'));

    updateRemoveButtons();
    updateBalance();
    cancelDictEditMode();
    if (currentEditingJournalId) cancelEditMode();
}

// 初回ロード時の入力行初期化
resetEntryForm();

entryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = document.getElementById('entryDate').value;
    const description = document.getElementById('entryDescription').value.trim();
    if (!date || !description) { showToast('日付と摘要を入力してください', 'error'); return; }
    const debits = [];
    const credits = [];
    let valid = true;
    debitLines.querySelectorAll('.entry-line').forEach(line => {
        const acctId = line.querySelector('select').value;
        const amount = parseFloat(line.querySelector('input').value) || 0;
        if (!acctId || amount <= 0) valid = false;
        debits.push({ accountId: acctId, amount });
    });
    creditLines.querySelectorAll('.entry-line').forEach(line => {
        const acctId = line.querySelector('select').value;
        const amount = parseFloat(line.querySelector('input').value) || 0;
        if (!acctId || amount <= 0) valid = false;
        credits.push({ accountId: acctId, amount });
    });
    if (!valid) { showToast('すべての科目と金額を正しく入力してください', 'error'); return; }
    const debitSum = debits.reduce((s, d) => s + d.amount, 0);
    const creditSum = credits.reduce((s, c) => s + c.amount, 0);
    if (debitSum !== creditSum) { showToast('借方と貸方の合計が一致しません', 'error'); return; }

    if (currentEditingJournalId) {
        store.updateJournal(currentEditingJournalId, { date, description, debits, credits });
        showToast('仕訳を更新しました ✓');
        cancelEditMode();
    } else {
        store.addJournal({ date, description, debits, credits });
        showToast('仕訳を登録しました ✓');
    }
    resetEntryForm();
});

entryForm.addEventListener('reset', (e) => {
    e.preventDefault();
    resetEntryForm();
});

function startEditJournal(journalId) {
    const journal = store.journals.find(j => j.id === journalId);
    if (!journal) return;
    currentEditingJournalId = journalId;
    cancelDictEditMode();

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const entryBtn = document.querySelector('.nav-btn[data-tab="journal-entry"]');
    if (entryBtn) entryBtn.classList.add('active');
    document.getElementById('journal-entry').classList.add('active');

    document.getElementById('entryDate').value = journal.date;
    document.getElementById('entryDescription').value = journal.description;

    debitLines.innerHTML = '';
    for (const d of journal.debits) {
        const line = createEntryLine('debit');
        line.querySelector('select').value = d.accountId;
        line.querySelector('input').value = d.amount;
        debitLines.appendChild(line);
    }
    creditLines.innerHTML = '';
    for (const c of journal.credits) {
        const line = createEntryLine('credit');
        line.querySelector('select').value = c.accountId;
        line.querySelector('input').value = c.amount;
        creditLines.appendChild(line);
    }

    updateRemoveButtons();
    updateBalance();

    document.getElementById('submitBtn').textContent = '仕訳を更新';
    document.getElementById('editCancelBtn').classList.remove('hidden');
    document.querySelector('#journal-entry .section-header h2').textContent = '仕訳編集';
    entryForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEditMode() {
    currentEditingJournalId = null;
    document.getElementById('submitBtn').textContent = '仕訳を登録';
    document.getElementById('editCancelBtn').classList.add('hidden');
    document.querySelector('#journal-entry .section-header h2').textContent = '仕訳入力';
}

// ===== 仕訳帳 =====
function renderJournal() {
    const from = document.getElementById('journalFrom').value;
    const to = document.getElementById('journalTo').value;
    const keyword = document.getElementById('journalKeyword').value;
    const entries = store.getFilteredJournals(from, to, keyword);
    const tbody = document.getElementById('journalBody');
    const empty = document.getElementById('journalEmpty');
    tbody.innerHTML = '';
    if (entries.length === 0) {
        empty.classList.remove('hidden');
        document.querySelector('#journal .table-wrap').style.display = 'none';
        return;
    }
    empty.classList.add('hidden');
    document.querySelector('#journal .table-wrap').style.display = '';
    for (const entry of entries) {
        const maxRows = Math.max(entry.debits.length, entry.credits.length);
        for (let i = 0; i < maxRows; i++) {
            const tr = document.createElement('tr');
            if (i === 0) {
                tr.innerHTML = `
                    <td rowspan="${maxRows}">${formatDate(entry.date)}</td>
                    <td rowspan="${maxRows}">${entry.description}</td>
                `;
            }
            const d = entry.debits[i];
            const c = entry.credits[i];
            const dAcct = d ? store.getAccount(d.accountId) : null;
            const cAcct = c ? store.getAccount(c.accountId) : null;
            tr.innerHTML += `
                <td>${dAcct ? `${dAcct.id} ${dAcct.name}` : ''}</td>
                <td class="col-amount">${d ? formatCurrency(d.amount) : ''}</td>
                <td>${cAcct ? `${cAcct.id} ${cAcct.name}` : ''}</td>
                <td class="col-amount">${c ? formatCurrency(c.amount) : ''}</td>
            `;
            if (i === 0) {
                const tdAction = document.createElement('td');
                tdAction.className = 'col-action';
                tdAction.setAttribute('rowspan', maxRows);
                const editBtn = document.createElement('button');
                editBtn.className = 'btn btn-secondary btn-sm';
                editBtn.textContent = '編集';
                editBtn.style.marginRight = '4px';
                editBtn.addEventListener('click', () => startEditJournal(entry.id));
                tdAction.appendChild(editBtn);
                const delBtn = document.createElement('button');
                delBtn.className = 'btn btn-danger btn-sm';
                delBtn.textContent = '削除';
                delBtn.addEventListener('click', () => {
                    if (confirm('この仕訳を削除しますか？')) {
                        store.deleteJournal(entry.id);
                        renderJournal();
                        showToast('仕訳を削除しました', 'info');
                    }
                });
                tdAction.appendChild(delBtn);
                tr.appendChild(tdAction);
            }
            tbody.appendChild(tr);
        }
    }
}

document.getElementById('journalFilter').addEventListener('click', renderJournal);
document.getElementById('journalReset').addEventListener('click', () => {
    document.getElementById('journalFrom').value = '';
    document.getElementById('journalTo').value = '';
    document.getElementById('journalKeyword').value = '';
    renderJournal();
});

// ===== 総勘定元帳 =====
function renderLedger() {
    const selectedId = document.getElementById('ledgerAccount').value;
    const content = document.getElementById('ledgerContent');
    const empty = document.getElementById('ledgerEmpty');
    content.innerHTML = '';
    const accountsToShow = selectedId
        ? store.accounts.filter(a => String(a.id) === String(selectedId))
        : [...store.accounts].sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));

    const relevantAccounts = accountsToShow.filter(acct => {
        return store.journals.some(j =>
            j.debits.some(d => String(d.accountId) === String(acct.id)) ||
            j.credits.some(c => String(c.accountId) === String(acct.id))
        );
    });
    if (relevantAccounts.length === 0) {
        empty.classList.remove('hidden');
        empty.querySelector('p').textContent = selectedId ? 'この勘定科目の取引はありません' : '取引データがありません';
        return;
    }
    empty.classList.add('hidden');
    for (const acct of relevantAccounts) {
        const block = document.createElement('div');
        block.className = 'ledger-account-block';
        const isDebitNormal = acct.type === 'asset' || acct.type === 'expense';
        let runningBalance = 0;
        let rows = '';
        for (const j of store.journals) {
            for (const d of j.debits) {
                if (String(d.accountId) === String(acct.id)) {
                    runningBalance += isDebitNormal ? d.amount : -d.amount;
                    rows += `<tr>
                        <td>${formatDate(j.date)}</td>
                        <td>${j.description}</td>
                        <td class="col-amount">${formatCurrency(d.amount)}</td>
                        <td class="col-amount"></td>
                        <td class="col-amount${runningBalance < 0 ? ' negative-balance' : ''}">${runningBalance < 0 ? '△' + formatCurrency(runningBalance) : formatCurrency(runningBalance)}</td>
                    </tr>`;
                }
            }
            for (const c of j.credits) {
                if (String(c.accountId) === String(acct.id)) {
                    runningBalance += isDebitNormal ? -c.amount : c.amount;
                    rows += `<tr>
                        <td>${formatDate(j.date)}</td>
                        <td>${j.description}</td>
                        <td class="col-amount"></td>
                        <td class="col-amount">${formatCurrency(c.amount)}</td>
                        <td class="col-amount${runningBalance < 0 ? ' negative-balance' : ''}">${runningBalance < 0 ? '△' + formatCurrency(runningBalance) : formatCurrency(runningBalance)}</td>
                    </tr>`;
                }
            }
        }
        block.innerHTML = `
            <div class="ledger-account-header">
                <span class="ledger-account-name">${acct.id} ${acct.name}</span>
                <div style="display:flex;align-items:center;gap:12px;">
                    <span class="ledger-account-type ${TYPE_CSS[acct.type]}">${TYPE_LABELS[acct.type]}</span>
                    <span class="ledger-balance${runningBalance < 0 ? ' negative-balance' : ''}">残高: ${runningBalance < 0 ? '△' + formatCurrency(runningBalance) : formatCurrency(runningBalance)}</span>
                </div>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr>
                        <th class="col-date">日付</th>
                        <th>摘要</th>
                        <th class="col-amount">借方</th>
                        <th class="col-amount">貸方</th>
                        <th class="col-amount">残高</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
        content.appendChild(block);
    }
}
document.getElementById('ledgerAccount').addEventListener('change', renderLedger);

// ===== 貸借対照表 (流動/固定 分類対応) =====
function renderBalanceSheet() {
    const dateVal = document.getElementById('bsDate').value || null;
    const assetAccounts = store.getAccountsByType('asset');
    const liabilityAccounts = store.getAccountsByType('liability');
    const equityAccounts = store.getAccountsByType('equity');

    const bsCurrentAssets = document.getElementById('bsCurrentAssets');
    const bsFixedAssets = document.getElementById('bsFixedAssets');
    const bsCurrentLiabilities = document.getElementById('bsCurrentLiabilities');
    const bsFixedLiabilities = document.getElementById('bsFixedLiabilities');
    const bsEquity = document.getElementById('bsEquity');

    bsCurrentAssets.innerHTML = '';
    bsFixedAssets.innerHTML = '';
    bsCurrentLiabilities.innerHTML = '';
    bsFixedLiabilities.innerHTML = '';
    bsEquity.innerHTML = '';

    let curAssetTotal = 0, fixAssetTotal = 0;
    for (const a of assetAccounts) {
        const bal = store.getBalance(a.id, dateVal);
        if (bal !== 0) {
            const displayBal = bal < 0 ? '△' + formatCurrency(bal) : formatCurrency(bal);
            const num = parseInt(a.id, 10);
            const isFixed = !isNaN(num) && num >= 1200 && num < 1300;
            const row = `<tr><td>${a.id} ${a.name}</td><td class="col-amount">${displayBal}</td></tr>`;
            if (isFixed) {
                bsFixedAssets.innerHTML += row;
                fixAssetTotal += bal;
            } else {
                bsCurrentAssets.innerHTML += row;
                curAssetTotal += bal;
            }
        }
    }
    if (curAssetTotal === 0) bsCurrentAssets.innerHTML = '<tr><td colspan="2" style="color:var(--text-muted);text-align:center;">なし</td></tr>';
    if (fixAssetTotal === 0) bsFixedAssets.innerHTML = '<tr><td colspan="2" style="color:var(--text-muted);text-align:center;">なし</td></tr>';
    document.getElementById('bsCurrentAssetsTotal').textContent = formatCurrency(curAssetTotal);
    document.getElementById('bsFixedAssetsTotal').textContent = formatCurrency(fixAssetTotal);
    const totalAssets = curAssetTotal + fixAssetTotal;
    document.getElementById('bsAssetsTotal').textContent = totalAssets < 0 ? '△' + formatCurrency(totalAssets) : formatCurrency(totalAssets);

    let curLiabTotal = 0, fixLiabTotal = 0;
    for (const a of liabilityAccounts) {
        const bal = store.getBalance(a.id, dateVal);
        if (bal !== 0) {
            const displayBal = bal < 0 ? '△' + formatCurrency(bal) : formatCurrency(bal);
            const num = parseInt(a.id, 10);
            const isFixed = !isNaN(num) && num >= 2200 && num < 2300;
            const row = `<tr><td>${a.id} ${a.name}</td><td class="col-amount">${displayBal}</td></tr>`;
            if (isFixed) {
                bsFixedLiabilities.innerHTML += row;
                fixLiabTotal += bal;
            } else {
                bsCurrentLiabilities.innerHTML += row;
                curLiabTotal += bal;
            }
        }
    }
    if (curLiabTotal === 0) bsCurrentLiabilities.innerHTML = '<tr><td colspan="2" style="color:var(--text-muted);text-align:center;">なし</td></tr>';
    if (fixLiabTotal === 0) bsFixedLiabilities.innerHTML = '<tr><td colspan="2" style="color:var(--text-muted);text-align:center;">なし</td></tr>';
    document.getElementById('bsCurrentLiabilitiesTotal').textContent = formatCurrency(curLiabTotal);
    document.getElementById('bsFixedLiabilitiesTotal').textContent = formatCurrency(fixLiabTotal);
    const totalLiab = curLiabTotal + fixLiabTotal;
    document.getElementById('bsLiabilitiesTotal').textContent = formatCurrency(totalLiab);

    let equityTotal = 0;
    for (const a of equityAccounts) {
        const bal = store.getBalance(a.id, dateVal);
        if (bal !== 0) {
            const displayBal = bal < 0 ? '△' + formatCurrency(bal) : formatCurrency(bal);
            bsEquity.innerHTML += `<tr><td>${a.id} ${a.name}</td><td class="col-amount">${displayBal}</td></tr>`;
            equityTotal += bal;
        }
    }

    let incomeTotal = 0, expenseTotal = 0;
    for (const a of store.getAccountsByType('income')) incomeTotal += store.getBalance(a.id, dateVal);
    for (const a of store.getAccountsByType('expense')) expenseTotal += store.getBalance(a.id, dateVal);
    const netIncome = incomeTotal - expenseTotal;
    if (netIncome !== 0) {
        const retainedDisplay = netIncome < 0 ? `△${formatCurrency(netIncome)}` : formatCurrency(netIncome);
        bsEquity.innerHTML += `<tr><td>繰越利益剰余金</td><td class="col-amount">${retainedDisplay}</td></tr>`;
    }

    const totalEq = equityTotal + netIncome;
    document.getElementById('bsEquityTotal').textContent = totalEq < 0 ? '△' + formatCurrency(totalEq) : formatCurrency(totalEq);
    const netTotal = totalLiab + totalEq;
    document.getElementById('bsLiabilitiesNetTotal').textContent = netTotal < 0 ? '△' + formatCurrency(netTotal) : formatCurrency(netTotal);
}
document.getElementById('bsGenerate').addEventListener('click', renderBalanceSheet);
document.getElementById('bsDate').value = getTodayString();

// ===== 損益計算書 (年始〜現在を初期設定) =====
function renderIncomeStatement() {
    const from = document.getElementById('plFrom').value || null;
    const to = document.getElementById('plTo').value || null;
    const incomeAccounts = store.getAccountsByType('income');
    const expenseAccounts = store.getAccountsByType('expense');
    const plIncome = document.getElementById('plIncome');
    const plExpense = document.getElementById('plExpense');
    plIncome.innerHTML = '';
    plExpense.innerHTML = '';

    function getPeriodBalance(accountId, type) {
        let balance = 0;
        const isDebitNormal = type === 'expense';
        const entries = store.getFilteredJournals(from, to);
        for (const j of entries) {
            for (const d of j.debits) {
                if (String(d.accountId) === String(accountId)) balance += isDebitNormal ? d.amount : -d.amount;
            }
            for (const c of j.credits) {
                if (String(c.accountId) === String(accountId)) balance += isDebitNormal ? -c.amount : c.amount;
            }
        }
        return balance;
    }

    let incTotal = 0;
    for (const a of incomeAccounts) {
        const bal = getPeriodBalance(a.id, a.type);
        if (bal !== 0) {
            plIncome.innerHTML += `<tr><td>${a.id} ${a.name}</td><td class="col-amount">${formatCurrency(bal)}</td></tr>`;
            incTotal += bal;
        }
    }
    if (incTotal === 0) plIncome.innerHTML = '<tr><td colspan="2" style="color:var(--text-muted);text-align:center;">データなし</td></tr>';
    document.getElementById('plIncomeTotal').textContent = formatCurrency(incTotal);

    let expTotal = 0;
    for (const a of expenseAccounts) {
        const bal = getPeriodBalance(a.id, a.type);
        if (bal !== 0) {
            plExpense.innerHTML += `<tr><td>${a.id} ${a.name}</td><td class="col-amount">${formatCurrency(bal)}</td></tr>`;
            expTotal += bal;
        }
    }
    if (expTotal === 0) plExpense.innerHTML = '<tr><td colspan="2" style="color:var(--text-muted);text-align:center;">データなし</td></tr>';
    document.getElementById('plExpenseTotal').textContent = formatCurrency(expTotal);

    const netIncome = incTotal - expTotal;
    const netEl = document.getElementById('plNetIncome');
    netEl.classList.remove('positive', 'negative');
    if (netIncome > 0) netEl.classList.add('positive');
    else if (netIncome < 0) netEl.classList.add('negative');
    document.getElementById('plNetValue').textContent = netIncome < 0 ? '△' + formatCurrency(netIncome) : formatCurrency(netIncome);
}
document.getElementById('plGenerate').addEventListener('click', renderIncomeStatement);

{
    const currentYear = new Date().getFullYear();
    document.getElementById('plFrom').value = `${currentYear}-01-01`;
    document.getElementById('plTo').value = getTodayString();
}

// ===== 勘定科目マスタ =====
function renderAccounts() {
    const content = document.getElementById('accountListContent');
    content.innerHTML = '';
    const typeOrder = ['asset', 'liability', 'equity', 'income', 'expense'];
    for (const type of typeOrder) {
        const accts = store.getAccountsByType(type);
        if (accts.length === 0) continue;
        const group = document.createElement('div');
        group.className = 'account-type-group';
        const header = document.createElement('div');
        header.className = `account-type-group-header ${TYPE_CSS[type]}`;
        header.textContent = `${TYPE_LABELS[type]}（${accts.length}件）`;
        group.appendChild(header);
        for (const acct of accts) {
            const used = store.isAccountUsed(acct.id);
            const item = document.createElement('div');
            item.className = 'account-item';
            item.dataset.accountId = acct.id;
            item.innerHTML = `
                <span class="account-item-id">${acct.id}</span>
                <span class="account-item-name">${acct.name}</span>
                ${used ? '<span class="account-used-badge">使用中</span>' : ''}
                <div class="account-item-actions">
                    <button class="btn btn-secondary btn-edit-account" data-id="${acct.id}">編集</button>
                    <button class="btn btn-danger btn-delete-account" data-id="${acct.id}" ${used ? 'disabled title="仕訳で使用中のため削除できません"' : ''}>削除</button>
                </div>
            `;
            group.appendChild(item);
        }
        content.appendChild(group);
    }
    content.querySelectorAll('.btn-edit-account').forEach(btn => {
        btn.addEventListener('click', () => startEditAccount(btn.dataset.id));
    });
    content.querySelectorAll('.btn-delete-account').forEach(btn => {
        if (btn.disabled) return;
        btn.addEventListener('click', () => {
            const acct = store.getAccount(btn.dataset.id);
            if (confirm(`「${acct.name}」を削除しますか？`)) {
                store.deleteAccount(btn.dataset.id);
                populateAllSelects();
                renderAccounts();
                showToast(`「${acct.name}」を削除しました`, 'info');
            }
        });
    });
}

function startEditAccount(id) {
    const acct = store.getAccount(id);
    if (!acct) return;
    const item = document.querySelector(`.account-item[data-account-id="${id}"]`);
    if (!item) return;
    const idSpan = item.querySelector('.account-item-id');
    const nameSpan = item.querySelector('.account-item-name');
    const actionsDiv = item.querySelector('.account-item-actions');
    
    const idInput = document.createElement('input');
    idInput.type = 'text';
    idInput.className = 'account-edit-input';
    idInput.value = acct.id;
    idInput.placeholder = '科目ID';
    idInput.pattern = '[a-zA-Z0-9_]+';
    idInput.style.maxWidth = '120px';
    idSpan.replaceWith(idInput);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'account-edit-input';
    nameInput.value = acct.name;
    nameInput.placeholder = '科目名';
    nameSpan.replaceWith(nameInput);

    const typeSelect = document.createElement('select');
    typeSelect.className = 'account-edit-select';
    for (const [val, label] of Object.entries(TYPE_LABELS)) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        if (val === acct.type) opt.selected = true;
        typeSelect.appendChild(opt);
    }
    nameInput.after(typeSelect);

    actionsDiv.innerHTML = '';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary btn-sm';
    saveBtn.textContent = '保存';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary btn-sm';
    cancelBtn.textContent = '取消';
    actionsDiv.appendChild(saveBtn);
    actionsDiv.appendChild(cancelBtn);

    idInput.focus();
    saveBtn.addEventListener('click', () => {
        const newId = idInput.value.trim();
        const newName = nameInput.value.trim();
        const newType = typeSelect.value;
        if (!newId || !newName) { showToast('科目IDと科目名を入力してください', 'error'); return; }
        const result = store.updateAccount(id, { id: newId, name: newName, type: newType });
        if (result === 'duplicate') { showToast('この科目IDは既に存在します', 'error'); return; }
        populateAllSelects();
        renderAccounts();
        showToast(`「${newName}」に更新しました ✓`);
    });
    cancelBtn.addEventListener('click', () => renderAccounts());
}

document.getElementById('accountForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('newAccountId').value.trim();
    const name = document.getElementById('newAccountName').value.trim();
    const type = document.getElementById('newAccountType').value;
    if (!id || !name) { showToast('科目IDと科目名を入力してください', 'error'); return; }
    if (!store.addAccount({ id, name, type })) {
        showToast('この科目IDは既に存在します', 'error');
        return;
    }
    populateAllSelects();
    renderAccounts();
    showToast(`「${name}」を追加しました ✓`);
    document.getElementById('accountForm').reset();
});

document.getElementById('resetAccountsBtn').addEventListener('click', () => {
    if (confirm('勘定科目をデフォルトに戻しますか？\n※ 仕訳データは削除されません')) {
        store.resetAccounts();
        populateAllSelects();
        renderAccounts();
        showToast('デフォルトの勘定科目に戻しました', 'info');
    }
});

// CSVエクスポート
document.getElementById('exportAccountsBtn').addEventListener('click', () => {
    let csv = '\uFEFFid,name,type\n';
    for (const a of store.accounts) {
        csv += `"${a.id}","${a.name.replace(/"/g, '""')}","${a.type}"\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kakeibo_accounts_${getTodayString().replace(/-/g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('勘定科目CSVをエクスポートしました ✓');
});

// CSVインポート
const importFileInput = document.getElementById('importAccountsFileInput');
document.getElementById('importAccountsBtn').addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const text = event.target.result;
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
            if (lines.length <= 1) { showToast('CSVにデータが含まれていません', 'error'); return; }
            let count = 0;
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
                if (cols.length >= 3) {
                    const [id, name, type] = cols;
                    if (id && name && ['asset', 'liability', 'equity', 'income', 'expense'].includes(type)) {
                        const existing = store.getAccount(id);
                        if (existing) {
                            store.updateAccount(id, { name, type });
                        } else {
                            store.addAccount({ id, name, type });
                        }
                        count++;
                    }
                }
            }
            populateAllSelects();
            renderAccounts();
            showToast(`${count}件の勘定科目をインポートしました ✓`);
        } catch (err) {
            showToast('CSVの読み込みに失敗しました', 'error');
        }
        importFileInput.value = '';
    };
    reader.readAsText(file, 'utf-8');
});

// ===== 仕訳辞書 =====
function populateDictionarySelect() {
    const sel = document.getElementById('dictionarySelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">📒 辞書から入力…</option>';
    const sorted = store.getSortedDictionaries();
    for (const dict of sorted) {
        const opt = document.createElement('option');
        opt.value = dict.id;
        opt.textContent = dict.name;
        sel.appendChild(opt);
    }
}
populateDictionarySelect();

const dictionarySelect = document.getElementById('dictionarySelect');
if (dictionarySelect) {
    dictionarySelect.addEventListener('change', () => {
        const dictId = dictionarySelect.value;
        if (!dictId) return;
        const dict = store.dictionaries.find(d => d.id === dictId);
        if (!dict) return;

        if (currentEditingJournalId) cancelEditMode();

        document.getElementById('entryDescription').value = dict.description;
        debitLines.innerHTML = '';
        for (const d of dict.debits) {
            const line = createEntryLine('debit');
            line.querySelector('select').value = d.accountId;
            line.querySelector('input').value = d.amount;
            debitLines.appendChild(line);
        }
        creditLines.innerHTML = '';
        for (const c of dict.credits) {
            const line = createEntryLine('credit');
            line.querySelector('select').value = c.accountId;
            line.querySelector('input').value = c.amount;
            creditLines.appendChild(line);
        }
        updateRemoveButtons();
        updateBalance();
        dictionarySelect.value = '';
        showToast(`「${dict.name}」を読み込みました`, 'info');
    });
}

const saveToDictBtn = document.getElementById('saveToDictBtn');
if (saveToDictBtn) {
    saveToDictBtn.addEventListener('click', () => {
        const description = document.getElementById('entryDescription').value.trim();
        const debits = [];
        const credits = [];
        let valid = true;
        debitLines.querySelectorAll('.entry-line').forEach(line => {
            const acctId = line.querySelector('select').value;
            const amount = parseFloat(line.querySelector('input').value) || 0;
            if (!acctId || amount <= 0) valid = false;
            debits.push({ accountId: acctId, amount });
        });
        creditLines.querySelectorAll('.entry-line').forEach(line => {
            const acctId = line.querySelector('select').value;
            const amount = parseFloat(line.querySelector('input').value) || 0;
            if (!acctId || amount <= 0) valid = false;
            credits.push({ accountId: acctId, amount });
        });
        if (!valid || debits.length === 0 || credits.length === 0) {
            showToast('辞書に登録するには科目と金額を正しく入力してください', 'error');
            return;
        }

        if (currentEditingDictId) {
            const currentDict = store.dictionaries.find(d => d.id === currentEditingDictId);
            const defaultName = currentDict ? currentDict.name : description;
            const name = prompt('辞書テンプレートの名前を入力してください:', defaultName);
            if (!name) return;
            store.updateDictionary(currentEditingDictId, { name, description, debits, credits });
            populateDictionarySelect();
            renderDictionaries();
            showToast(`「${name}」を更新しました ✓`);
            cancelDictEditMode();
        } else {
            const name = prompt('辞書テンプレートの名前を入力してください:', description || '');
            if (!name) return;
            store.addDictionary({ name, description, debits, credits });
            populateDictionarySelect();
            renderDictionaries();
            showToast(`「${name}」を辞書に登録しました ✓`);
        }
    });
}

function startEditDictionary(dictId) {
    const dict = store.dictionaries.find(d => d.id === dictId);
    if (!dict) return;
    currentEditingDictId = dictId;
    if (currentEditingJournalId) cancelEditMode();

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const entryBtn = document.querySelector('.nav-btn[data-tab="journal-entry"]');
    if (entryBtn) entryBtn.classList.add('active');
    document.getElementById('journal-entry').classList.add('active');

    document.getElementById('entryDescription').value = dict.description;
    debitLines.innerHTML = '';
    for (const d of dict.debits) {
        const line = createEntryLine('debit');
        line.querySelector('select').value = d.accountId;
        line.querySelector('input').value = d.amount;
        debitLines.appendChild(line);
    }
    creditLines.innerHTML = '';
    for (const c of dict.credits) {
        const line = createEntryLine('credit');
        line.querySelector('select').value = c.accountId;
        line.querySelector('input').value = c.amount;
        creditLines.appendChild(line);
    }
    updateRemoveButtons();
    updateBalance();

    saveToDictBtn.textContent = '📒 辞書を上書き更新';
    saveToDictBtn.classList.add('btn-primary');
    saveToDictBtn.classList.remove('btn-ghost');
    entryForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(`「${dict.name}」の編集モードに入りました`, 'info');
}

function cancelDictEditMode() {
    currentEditingDictId = null;
    saveToDictBtn.textContent = '📒 辞書に登録';
    saveToDictBtn.classList.remove('btn-primary');
    saveToDictBtn.classList.add('btn-ghost');
}

const dictSortSelect = document.getElementById('dictSortSelect');
if (dictSortSelect) {
    dictSortSelect.value = store.dictSortOrder;
    dictSortSelect.addEventListener('change', () => {
        store.dictSortOrder = dictSortSelect.value;
        store.save();
        populateDictionarySelect();
        renderDictionaries();
    });
}

function renderDictionaries() {
    const content = document.getElementById('dictionaryListContent');
    const empty = document.getElementById('dictionaryEmpty');
    if (!content) return;
    content.innerHTML = '';
    if (store.dictionaries.length === 0) {
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');
    const sorted = store.getSortedDictionaries();
    for (const dict of sorted) {
        const debitNames = dict.debits.map(d => {
            const acct = store.getAccount(d.accountId);
            return acct ? `${acct.id} ${acct.name}` : '不明';
        }).join(', ');
        const creditNames = dict.credits.map(c => {
            const acct = store.getAccount(c.accountId);
            return acct ? `${acct.id} ${acct.name}` : '不明';
        }).join(', ');
        const totalAmount = dict.debits.reduce((s, d) => s + d.amount, 0);
        const item = document.createElement('div');
        item.className = 'dictionary-item';
        item.innerHTML = `
            <div class="dictionary-item-info">
                <div class="dictionary-item-desc">${dict.name}</div>
                <div class="dictionary-item-detail">
                    <span>借: ${debitNames}</span>
                    <span>→</span>
                    <span>貸: ${creditNames}</span>
                </div>
            </div>
            <span class="dictionary-amount">${formatCurrency(totalAmount)}</span>
            <div class="dictionary-item-actions">
                <button class="btn btn-secondary btn-sm btn-edit-dict" data-id="${dict.id}">編集</button>
                <button class="btn btn-danger btn-sm btn-delete-dict" data-id="${dict.id}">削除</button>
            </div>
        `;
        item.querySelector('.btn-edit-dict').addEventListener('click', () => startEditDictionary(dict.id));
        item.querySelector('.btn-delete-dict').addEventListener('click', () => {
            if (confirm(`「${dict.name}」を辞書から削除しますか？`)) {
                store.deleteDictionary(dict.id);
                populateDictionarySelect();
                renderDictionaries();
                showToast(`「${dict.name}」を削除しました`, 'info');
            }
        });
        content.appendChild(item);
    }
}
renderDictionaries();

// ===== Firebase Authentication & 強化UI =====
function setSyncStatus(status) {
    const ind = document.getElementById('syncIndicator');
    if (!ind) return;
    ind.className = 'sync-indicator';
    if (status === 'synced') {
        ind.classList.add('synced');
        ind.textContent = '✅ クラウド同期済み';
    } else if (status === 'syncing') {
        ind.classList.add('syncing');
        ind.textContent = '🔄 同期中...';
    } else if (status === 'error') {
        ind.style.backgroundColor = 'var(--accent-red-dim)';
        ind.style.color = 'var(--accent-red)';
        ind.textContent = '❌ 同期エラー';
    } else {
        ind.style.backgroundColor = '';
        ind.style.color = '';
        ind.textContent = '⚠️ ローカル（未同期）';
    }
}

function getFirebaseAuthErrorMessage(code) {
    switch (code) {
        case 'auth/invalid-email': return '有効なメールアドレスを入力してください。';
        case 'auth/user-not-found': return 'このメールアドレスのアカウントは見つかりません。';
        case 'auth/wrong-password': return 'パスワードが間違っています。';
        case 'auth/email-already-in-use': return 'このメールアドレスは既に登録されています。';
        case 'auth/weak-password': return 'パスワードは6文字以上で入力してください。';
        case 'auth/popup-closed-by-user': return 'ログイン処理がキャンセルされました。';
        default: return 'エラーが発生しました。時間をおいて再試行してください。';
    }
}

let isLoginMode = true;
const authModal = document.getElementById('authModal');
const headerLoginBtn = document.getElementById('headerLoginBtn');
const headerLogoutBtn = document.getElementById('headerLogoutBtn');
const headerUserBox = document.getElementById('headerUserBox');
const headerUserEmail = document.getElementById('headerUserEmail');

if (headerLoginBtn) {
    headerLoginBtn.addEventListener('click', () => {
        isLoginMode = true;
        updateAuthModalUI();
        authModal.classList.remove('hidden');
    });
}
const closeAuthModal = document.getElementById('closeAuthModal');
if (closeAuthModal) {
    closeAuthModal.addEventListener('click', () => authModal.classList.add('hidden'));
}
const switchAuthMode = document.getElementById('switchAuthMode');
if (switchAuthMode) {
    switchAuthMode.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        updateAuthModalUI();
    });
}

function updateAuthModalUI() {
    document.getElementById('authModalTitle').textContent = isLoginMode ? 'ログイン' : '新規登録';
    document.getElementById('authSubmitBtn').textContent = isLoginMode ? 'ログイン' : '登録して始める';
    document.getElementById('switchAuthMode').textContent = isLoginMode ? 'アカウントをお持ちでない方は 新規登録' : '既にアカウントをお持ちの方は ログイン';
    document.getElementById('authConfirmPasswordGroup').classList.toggle('hidden', isLoginMode);
    document.getElementById('authForgotWrap').classList.toggle('hidden', !isLoginMode);
    document.getElementById('authErrorMsg').classList.add('hidden');
}

const togglePasswordBtn = document.getElementById('togglePasswordBtn');
const authPasswordInput = document.getElementById('authPassword');
if (togglePasswordBtn && authPasswordInput) {
    togglePasswordBtn.addEventListener('click', () => {
        const isPass = authPasswordInput.type === 'password';
        authPasswordInput.type = isPass ? 'text' : 'password';
        togglePasswordBtn.textContent = isPass ? '🔒' : '👁️';
    });
}

const forgotPasswordLink = document.getElementById('forgotPasswordLink');
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('authEmail').value.trim();
        if (!email) { showToast('パスワード再設定メールを送信するメールアドレスを入力してください', 'error'); return; }
        try {
            await auth.sendPasswordResetEmail(email);
            showToast('パスワード再設定メールを送信しました ✓', 'info');
        } catch (err) {
            showToast(getFirebaseAuthErrorMessage(err.code), 'error');
        }
    });
}

const googleLoginBtn = document.getElementById('googleLoginBtn');
if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            await auth.signInWithPopup(provider);
            showToast('Googleでログインしました ✓');
            authModal.classList.add('hidden');
        } catch (err) {
            if (err.code !== 'auth/popup-closed-by-user') {
                showToast(getFirebaseAuthErrorMessage(err.code), 'error');
            }
        }
    });
}

const authForm = document.getElementById('authForm');
if (authForm) {
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPassword').value;
        const confirmPassword = document.getElementById('authConfirmPassword').value;
        const errorMsg = document.getElementById('authErrorMsg');
        const submitBtn = document.getElementById('authSubmitBtn');

        errorMsg.classList.add('hidden');
        if (!isLoginMode && password !== confirmPassword) {
            errorMsg.textContent = '確認用パスワードが一致しません。';
            errorMsg.classList.remove('hidden');
            return;
        }

        submitBtn.disabled = true;
        try {
            if (isLoginMode) {
                await auth.signInWithEmailAndPassword(email, password);
                showToast('ログインしました ✓');
            } else {
                await auth.createUserWithEmailAndPassword(email, password);
                showToast('アカウントを作成しました ✓');
            }
            authModal.classList.add('hidden');
            authForm.reset();
        } catch (err) {
            errorMsg.textContent = getFirebaseAuthErrorMessage(err.code);
            errorMsg.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
        }
    });
}

if (headerLogoutBtn) {
    headerLogoutBtn.addEventListener('click', () => {
        if (typeof auth !== 'undefined') {
            auth.signOut().then(() => showToast('ログアウトしました', 'info'));
        }
    });
}

if (typeof auth !== 'undefined') {
    auth.onAuthStateChanged(user => {
        if (user) {
            if (headerLoginBtn) headerLoginBtn.classList.add('hidden');
            if (headerUserBox) headerUserBox.classList.remove('hidden');
            if (headerUserEmail) headerUserEmail.textContent = user.displayName || user.email;
            store.startRealtimeSync(user.uid);
        } else {
            if (headerLoginBtn) headerLoginBtn.classList.remove('hidden');
            if (headerUserBox) headerUserBox.classList.add('hidden');
            store.stopRealtimeSync();
        }
    });
}

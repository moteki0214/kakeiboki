/* ============================================
   複式簿記家計簿 — Application Logic
   ============================================ */

// ===== 勘定科目マスタ =====
const DEFAULT_ACCOUNTS = [
    { id: 'cash', name: '現金', type: 'asset' },
    { id: 'bank', name: '普通預金', type: 'asset' },
    { id: 'emoney', name: '電子マネー', type: 'asset' },
    { id: 'credit_card', name: 'クレジットカード', type: 'liability' },
    { id: 'capital', name: '元入金', type: 'equity' },
    { id: 'salary', name: '給与収入', type: 'income' },
    { id: 'side_income', name: '副業収入', type: 'income' },
    { id: 'other_income', name: 'その他収入', type: 'income' },
    { id: 'food', name: '食費', type: 'expense' },
    { id: 'housing', name: '住居費', type: 'expense' },
    { id: 'utility', name: '水道光熱費', type: 'expense' },
    { id: 'telecom', name: '通信費', type: 'expense' },
    { id: 'transport', name: '交通費', type: 'expense' },
    { id: 'daily', name: '日用品費', type: 'expense' },
    { id: 'medical', name: '医療費', type: 'expense' },
    { id: 'entertain', name: '娯楽費', type: 'expense' },
    { id: 'clothing', name: '被服費', type: 'expense' },
    { id: 'education', name: '教育費', type: 'expense' },
    { id: 'social', name: '交際費', type: 'expense' },
    { id: 'other_expense', name: 'その他支出', type: 'expense' },
];

const TYPE_LABELS = { asset: '資産', liability: '負債', equity: '純資産', income: '収益', expense: '費用' };
const TYPE_CSS = { asset: 'type-asset', liability: 'type-liability', equity: 'type-equity', income: 'type-income', expense: 'type-expense' };

// ===== データ管理 =====
class DataStore {
    constructor() {
        this.accounts = JSON.parse(localStorage.getItem('kakeibo_accounts')) || [...DEFAULT_ACCOUNTS];
        this.journals = JSON.parse(localStorage.getItem('kakeibo_journals')) || [];
        this.userId = null;
        this.unsubscribe = null;
    }
    save() {
        localStorage.setItem('kakeibo_accounts', JSON.stringify(this.accounts));
        localStorage.setItem('kakeibo_journals', JSON.stringify(this.journals));
        this.syncToFirestore();
    }
    async syncToFirestore() {
        if (!this.userId || typeof db === 'undefined') return;
        setSyncStatus('syncing');
        try {
            await db.collection('users').doc(this.userId).set({
                accounts: this.accounts,
                journals: this.journals,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
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
                    this.journals.sort((a, b) => a.date.localeCompare(b.date));
                }
                localStorage.setItem('kakeibo_accounts', JSON.stringify(this.accounts));
                localStorage.setItem('kakeibo_journals', JSON.stringify(this.journals));
                populateAllSelects();
                const activeBtn = document.querySelector('.nav-btn.active');
                if (activeBtn) {
                    const activeTab = activeBtn.dataset.tab;
                    if (activeTab === 'journal') renderJournal();
                    if (activeTab === 'ledger') renderLedger();
                    if (activeTab === 'balance-sheet') renderBalanceSheet();
                    if (activeTab === 'income-statement') renderIncomeStatement();
                    if (activeTab === 'accounts') renderAccounts();
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
        this.journals.sort((a, b) => a.date.localeCompare(b.date));
        this.save();
        return entry;
    }
    deleteJournal(id) {
        this.journals = this.journals.filter(j => j.id !== id);
        this.save();
    }
    getAccount(id) { return this.accounts.find(a => a.id === id); }
    getAccountsByType(type) { return this.accounts.filter(a => a.type === type); }
    addAccount(account) {
        if (this.accounts.some(a => a.id === account.id)) return false;
        this.accounts.push(account);
        this.save();
        return true;
    }
    updateAccount(id, updates) {
        const acct = this.getAccount(id);
        if (!acct) return false;
        // IDの変更処理（仕訳データの参照も一括更新）
        if (updates.id !== undefined && updates.id !== id) {
            const newId = updates.id;
            // 重複チェック
            if (this.accounts.some(a => a.id === newId)) return 'duplicate';
            // 仕訳データ内の参照を更新
            for (const j of this.journals) {
                for (const d of j.debits) {
                    if (d.accountId === id) d.accountId = newId;
                }
                for (const c of j.credits) {
                    if (c.accountId === id) c.accountId = newId;
                }
            }
            acct.id = newId;
        }
        if (updates.name !== undefined) acct.name = updates.name;
        if (updates.type !== undefined) acct.type = updates.type;
        this.save();
        return true;
    }
    deleteAccount(id) {
        if (this.isAccountUsed(id)) return false;
        this.accounts = this.accounts.filter(a => a.id !== id);
        this.save();
        return true;
    }
    isAccountUsed(id) {
        return this.journals.some(j =>
            j.debits.some(d => d.accountId === id) ||
            j.credits.some(c => c.accountId === id)
        );
    }
    resetAccounts() {
        this.accounts = [...DEFAULT_ACCOUNTS];
        this.save();
    }
    getFilteredJournals(from, to) {
        return this.journals.filter(j => {
            if (from && j.date < from) return false;
            if (to && j.date > to) return false;
            return true;
        });
    }
    // 勘定科目の残高を計算（借方正：資産・費用、貸方正：負債・純資産・収益）
    getBalance(accountId, upToDate) {
        let balance = 0;
        const acct = this.getAccount(accountId);
        if (!acct) return 0;
        const isDebitNormal = acct.type === 'asset' || acct.type === 'expense';
        for (const j of this.journals) {
            if (upToDate && j.date > upToDate) continue;
            for (const d of j.debits) {
                if (d.accountId === accountId) balance += isDebitNormal ? d.amount : -d.amount;
            }
            for (const c of j.credits) {
                if (c.accountId === accountId) balance += isDebitNormal ? -c.amount : c.amount;
            }
        }
        return balance;
    }
}

const store = new DataStore();

// ===== ユーティリティ =====
function formatCurrency(amount) {
    return '¥' + Math.abs(amount).toLocaleString('ja-JP');
}
function formatDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
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
        // タブ切替時にデータをリフレッシュ
        if (btn.dataset.tab === 'journal') renderJournal();
        if (btn.dataset.tab === 'ledger') renderLedger();
        if (btn.dataset.tab === 'balance-sheet') renderBalanceSheet();
        if (btn.dataset.tab === 'income-statement') renderIncomeStatement();
        if (btn.dataset.tab === 'accounts') renderAccounts();
    });
});

// ===== ヘッダー日付 =====
function updateHeaderDate() {
    const now = new Date();
    const opts = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    document.getElementById('headerDate').textContent = now.toLocaleDateString('ja-JP', opts);
}
updateHeaderDate();

// ===== 勘定科目セレクトボックスの生成 =====
function populateAccountSelect(selectEl) {
    const current = selectEl.value;
    selectEl.innerHTML = '<option value="">勘定科目を選択</option>';
    const groups = {};
    for (const acct of store.accounts) {
        if (!groups[acct.type]) groups[acct.type] = [];
        groups[acct.type].push(acct);
    }
    for (const [type, accts] of Object.entries(groups)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = TYPE_LABELS[type];
        for (const a of accts) {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = a.name;
            optgroup.appendChild(opt);
        }
        selectEl.appendChild(optgroup);
    }
    if (current) selectEl.value = current;
}

function populateAllSelects() {
    document.querySelectorAll('.account-select').forEach(populateAccountSelect);
    // 元帳の勘定科目セレクト
    const ledgerSel = document.getElementById('ledgerAccount');
    if (ledgerSel) {
        const cur = ledgerSel.value;
        ledgerSel.innerHTML = '<option value="">すべて</option>';
        for (const acct of store.accounts) {
            const opt = document.createElement('option');
            opt.value = acct.id;
            opt.textContent = `${acct.name}（${TYPE_LABELS[acct.type]}）`;
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

// 日付のデフォルトを今日に
document.getElementById('entryDate').valueAsDate = new Date();

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

// 金額入力時にリアルタイム更新
document.querySelectorAll('.amount-input').forEach(inp => {
    inp.addEventListener('input', updateBalance);
});

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
    store.addJournal({ date, description, debits, credits });
    showToast('仕訳を登録しました ✓');
    entryForm.reset();
    document.getElementById('entryDate').valueAsDate = new Date();
    // 行をリセット（1行ずつに戻す）
    debitLines.innerHTML = '';
    creditLines.innerHTML = '';
    debitLines.appendChild(createEntryLine('debit'));
    creditLines.appendChild(createEntryLine('credit'));
    updateRemoveButtons();
    updateBalance();
});

entryForm.addEventListener('reset', () => {
    setTimeout(() => {
        document.getElementById('entryDate').valueAsDate = new Date();
        debitLines.innerHTML = '';
        creditLines.innerHTML = '';
        debitLines.appendChild(createEntryLine('debit'));
        creditLines.appendChild(createEntryLine('credit'));
        updateRemoveButtons();
        updateBalance();
    }, 0);
});

// ===== 仕訳帳 =====
function renderJournal() {
    const from = document.getElementById('journalFrom').value;
    const to = document.getElementById('journalTo').value;
    const entries = store.getFilteredJournals(from, to);
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
                <td>${dAcct ? dAcct.name : ''}</td>
                <td class="col-amount">${d ? formatCurrency(d.amount) : ''}</td>
                <td>${cAcct ? cAcct.name : ''}</td>
                <td class="col-amount">${c ? formatCurrency(c.amount) : ''}</td>
            `;
            if (i === 0) {
                const tdAction = document.createElement('td');
                tdAction.className = 'col-action';
                tdAction.setAttribute('rowspan', maxRows);
                const delBtn = document.createElement('button');
                delBtn.className = 'btn btn-danger';
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
    renderJournal();
});

// ===== 総勘定元帳 =====
function renderLedger() {
    const selectedId = document.getElementById('ledgerAccount').value;
    const content = document.getElementById('ledgerContent');
    const empty = document.getElementById('ledgerEmpty');
    content.innerHTML = '';
    const accountsToShow = selectedId
        ? store.accounts.filter(a => a.id === selectedId)
        : store.accounts;
    // 取引があるアカウントのみ表示
    const relevantAccounts = accountsToShow.filter(acct => {
        return store.journals.some(j =>
            j.debits.some(d => d.accountId === acct.id) ||
            j.credits.some(c => c.accountId === acct.id)
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
                if (d.accountId === acct.id) {
                    runningBalance += isDebitNormal ? d.amount : -d.amount;
                    rows += `<tr>
                        <td>${formatDate(j.date)}</td>
                        <td>${j.description}</td>
                        <td class="col-amount">${formatCurrency(d.amount)}</td>
                        <td class="col-amount"></td>
                        <td class="col-amount">${formatCurrency(runningBalance)}</td>
                    </tr>`;
                }
            }
            for (const c of j.credits) {
                if (c.accountId === acct.id) {
                    runningBalance += isDebitNormal ? -c.amount : c.amount;
                    rows += `<tr>
                        <td>${formatDate(j.date)}</td>
                        <td>${j.description}</td>
                        <td class="col-amount"></td>
                        <td class="col-amount">${formatCurrency(c.amount)}</td>
                        <td class="col-amount">${formatCurrency(runningBalance)}</td>
                    </tr>`;
                }
            }
        }
        block.innerHTML = `
            <div class="ledger-account-header">
                <span class="ledger-account-name">${acct.name}</span>
                <div style="display:flex;align-items:center;gap:12px;">
                    <span class="ledger-account-type ${TYPE_CSS[acct.type]}">${TYPE_LABELS[acct.type]}</span>
                    <span class="ledger-balance">残高: ${formatCurrency(runningBalance)}</span>
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

// ===== 貸借対照表 =====
function renderBalanceSheet() {
    const dateVal = document.getElementById('bsDate').value || null;
    const assetAccounts = store.getAccountsByType('asset');
    const liabilityAccounts = store.getAccountsByType('liability');
    const equityAccounts = store.getAccountsByType('equity');

    const bsAssets = document.getElementById('bsAssets');
    const bsLiabilities = document.getElementById('bsLiabilities');
    bsAssets.innerHTML = '';
    bsLiabilities.innerHTML = '';

    let assetsTotal = 0;
    for (const a of assetAccounts) {
        const bal = store.getBalance(a.id, dateVal);
        if (bal !== 0) {
            bsAssets.innerHTML += `<tr><td>${a.name}</td><td class="col-amount">${formatCurrency(bal)}</td></tr>`;
            assetsTotal += bal;
        }
    }
    if (assetsTotal === 0) bsAssets.innerHTML = '<tr><td colspan="2" style="color:var(--text-muted);text-align:center;">データなし</td></tr>';
    document.getElementById('bsAssetsTotal').textContent = formatCurrency(assetsTotal);

    let liabTotal = 0;
    for (const a of liabilityAccounts) {
        const bal = store.getBalance(a.id, dateVal);
        if (bal !== 0) {
            bsLiabilities.innerHTML += `<tr><td>${a.name}</td><td class="col-amount">${formatCurrency(bal)}</td></tr>`;
            liabTotal += bal;
        }
    }
    // 純資産
    let equityTotal = 0;
    for (const a of equityAccounts) {
        const bal = store.getBalance(a.id, dateVal);
        if (bal !== 0) {
            bsLiabilities.innerHTML += `<tr><td>${a.name}</td><td class="col-amount">${formatCurrency(bal)}</td></tr>`;
            equityTotal += bal;
        }
    }
    // 当期純利益を純資産に加算
    let incomeTotal = 0, expenseTotal = 0;
    for (const a of store.getAccountsByType('income')) incomeTotal += store.getBalance(a.id, dateVal);
    for (const a of store.getAccountsByType('expense')) expenseTotal += store.getBalance(a.id, dateVal);
    const netIncome = incomeTotal - expenseTotal;
    if (netIncome !== 0) {
        const retainedDisplay = netIncome < 0 ? `△${formatCurrency(netIncome)}` : formatCurrency(netIncome);
        bsLiabilities.innerHTML += `<tr><td>繰越利益剰余金</td><td class="col-amount">${retainedDisplay}</td></tr>`;
    }

    const netTotal = liabTotal + equityTotal + netIncome;
    if (liabTotal === 0 && equityTotal === 0 && netIncome === 0) {
        bsLiabilities.innerHTML = '<tr><td colspan="2" style="color:var(--text-muted);text-align:center;">データなし</td></tr>';
    }
    document.getElementById('bsLiabilitiesTotal').textContent = formatCurrency(liabTotal);
    document.getElementById('bsLiabilitiesNetTotal').textContent = formatCurrency(netTotal);
}

document.getElementById('bsGenerate').addEventListener('click', renderBalanceSheet);
// デフォルト日を今日に
document.getElementById('bsDate').valueAsDate = new Date();

// ===== 損益計算書 =====
function renderIncomeStatement() {
    const from = document.getElementById('plFrom').value || null;
    const to = document.getElementById('plTo').value || null;
    const incomeAccounts = store.getAccountsByType('income');
    const expenseAccounts = store.getAccountsByType('expense');
    const plIncome = document.getElementById('plIncome');
    const plExpense = document.getElementById('plExpense');
    plIncome.innerHTML = '';
    plExpense.innerHTML = '';

    // 期間指定の残高計算
    function getPeriodBalance(accountId, type) {
        let balance = 0;
        const isDebitNormal = type === 'expense';
        const entries = store.getFilteredJournals(from, to);
        for (const j of entries) {
            for (const d of j.debits) {
                if (d.accountId === accountId) balance += isDebitNormal ? d.amount : -d.amount;
            }
            for (const c of j.credits) {
                if (c.accountId === accountId) balance += isDebitNormal ? -c.amount : c.amount;
            }
        }
        return balance;
    }

    let incTotal = 0;
    for (const a of incomeAccounts) {
        const bal = getPeriodBalance(a.id, a.type);
        if (bal !== 0) {
            plIncome.innerHTML += `<tr><td>${a.name}</td><td class="col-amount">${formatCurrency(bal)}</td></tr>`;
            incTotal += bal;
        }
    }
    if (incTotal === 0) plIncome.innerHTML = '<tr><td colspan="2" style="color:var(--text-muted);text-align:center;">データなし</td></tr>';
    document.getElementById('plIncomeTotal').textContent = formatCurrency(incTotal);

    let expTotal = 0;
    for (const a of expenseAccounts) {
        const bal = getPeriodBalance(a.id, a.type);
        if (bal !== 0) {
            plExpense.innerHTML += `<tr><td>${a.name}</td><td class="col-amount">${formatCurrency(bal)}</td></tr>`;
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
    document.getElementById('plNetValue').textContent = (netIncome < 0 ? '-' : '') + formatCurrency(netIncome);
}

document.getElementById('plGenerate').addEventListener('click', renderIncomeStatement);

// ===== 勘定科目管理 =====
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
    // 編集ボタン
    content.querySelectorAll('.btn-edit-account').forEach(btn => {
        btn.addEventListener('click', () => startEditAccount(btn.dataset.id));
    });
    // 削除ボタン
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
    // IDをインプットに変更
    const idInput = document.createElement('input');
    idInput.type = 'text';
    idInput.className = 'account-edit-input';
    idInput.value = acct.id;
    idInput.placeholder = '科目ID';
    idInput.pattern = '[a-zA-Z0-9_]+';
    idInput.style.maxWidth = '120px';
    idSpan.replaceWith(idInput);
    // 名前をインプットに変更
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'account-edit-input';
    nameInput.value = acct.name;
    nameInput.placeholder = '科目名';
    nameSpan.replaceWith(nameInput);
    // タイプセレクトを追加
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
    // ボタンを保存・キャンセルに変更
    actionsDiv.innerHTML = '';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = '保存';
    saveBtn.style.padding = 'var(--space-xs) var(--space-sm)';
    saveBtn.style.fontSize = '0.78rem';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = '取消';
    cancelBtn.style.padding = 'var(--space-xs) var(--space-sm)';
    cancelBtn.style.fontSize = '0.78rem';
    actionsDiv.appendChild(saveBtn);
    actionsDiv.appendChild(cancelBtn);
    idInput.focus();
    idInput.select();
    saveBtn.addEventListener('click', () => {
        const newId = idInput.value.trim();
        const newName = nameInput.value.trim();
        const newType = typeSelect.value;
        if (!newId) { showToast('科目IDを入力してください', 'error'); return; }
        if (!/^[a-zA-Z0-9_]+$/.test(newId)) { showToast('科目IDは英数字とアンダースコアのみ使用できます', 'error'); return; }
        if (!newName) { showToast('科目名を入力してください', 'error'); return; }
        const result = store.updateAccount(id, { id: newId, name: newName, type: newType });
        if (result === 'duplicate') { showToast('この科目IDは既に存在します', 'error'); return; }
        populateAllSelects();
        renderAccounts();
        showToast(`「${newName}」に更新しました ✓`);
    });
    cancelBtn.addEventListener('click', () => renderAccounts());
    const handleKeydown = (e) => {
        if (e.key === 'Enter') saveBtn.click();
        if (e.key === 'Escape') cancelBtn.click();
    };
    idInput.addEventListener('keydown', handleKeydown);
    nameInput.addEventListener('keydown', handleKeydown);
}

// 科目追加フォーム
document.getElementById('accountForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('newAccountId').value.trim();
    const name = document.getElementById('newAccountName').value.trim();
    const type = document.getElementById('newAccountType').value;
    if (!id || !name) { showToast('科目IDと科目名を入力してください', 'error'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(id)) { showToast('科目IDは英数字とアンダースコアのみ使用できます', 'error'); return; }
    if (!store.addAccount({ id, name, type })) {
        showToast('この科目IDは既に存在します', 'error');
        return;
    }
    populateAllSelects();
    renderAccounts();
    showToast(`「${name}」を追加しました ✓`);
    document.getElementById('accountForm').reset();
});

// デフォルトにリセット
document.getElementById('resetAccountsBtn').addEventListener('click', () => {
    if (confirm('勘定科目をデフォルトに戻しますか？\n※ 仕訳データは削除されません')) {
        store.resetAccounts();
        populateAllSelects();
        renderAccounts();
        showToast('デフォルトの勘定科目に戻しました', 'info');
    }
});

// ===== Firebase Authentication & Sync UI =====
function setSyncStatus(status) {
    const ind = document.getElementById('syncIndicator');
    if (!ind) return;
    ind.className = 'sync-indicator';
    if (status === 'synced') {
        ind.classList.add('synced');
        ind.textContent = '✅ クラウドと同期済み';
    } else if (status === 'syncing') {
        ind.classList.add('syncing');
        ind.textContent = '🔄 同期中...';
    } else if (status === 'error') {
        ind.classList.add('syncing'); // 赤く点滅の代わりにPulseを使い回すか、エラー色はCSSに依存しない暫定処置です
        ind.style.backgroundColor = 'var(--accent-red-dim)';
        ind.style.color = 'var(--accent-red)';
        ind.textContent = '❌ 同期エラー';
    } else {
        ind.style.backgroundColor = '';
        ind.style.color = '';
        ind.textContent = '⚠️ ローカル（未同期）';
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
    document.getElementById('authErrorMsg').classList.add('hidden');
}

const authForm = document.getElementById('authForm');
if (authForm) {
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('authEmail').value;
        const password = document.getElementById('authPassword').value;
        const errorMsg = document.getElementById('authErrorMsg');
        const submitBtn = document.getElementById('authSubmitBtn');

        errorMsg.classList.add('hidden');
        submitBtn.disabled = true;

        try {
            if (isLoginMode) {
                await auth.signInWithEmailAndPassword(email, password);
                showToast('ログインしました', 'success');
            } else {
                await auth.createUserWithEmailAndPassword(email, password);
                showToast('アカウントを作成しました', 'success');
            }
            authModal.classList.add('hidden');
            authForm.reset();
        } catch (err) {
            // Firebaseのエラーメッセージを日本語化するか、生のメッセージを表示
            errorMsg.textContent = 'エラー: ' + err.message;
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
            if (headerUserEmail) headerUserEmail.textContent = user.email;
            store.startRealtimeSync(user.uid);
        } else {
            if (headerLoginBtn) headerLoginBtn.classList.remove('hidden');
            if (headerUserBox) headerUserBox.classList.add('hidden');
            store.stopRealtimeSync();
        }
    });
}

// ===== 初期化 =====
updateRemoveButtons();

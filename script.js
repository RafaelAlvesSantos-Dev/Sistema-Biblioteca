/**
 * SGB — Sistema de Gestão de Biblioteca
 * IFPR Colombo
 *
 * Módulos:
 *  - Storage   : leitura/escrita no localStorage
 *  - Books     : CRUD de livros
 *  - Loans     : CRUD de empréstimos
 *  - UI        : renderização de tabelas e badges
 *  - Dashboard : atualização dos cards de estatísticas
 *  - Toast     : notificações não-bloqueantes
 *  - Validation: validação de formulários
 *  - Navigation: controle de seções e menu mobile
 */

'use strict';

/* ===================================================
   MÓDULO: Storage
   Abstrai acesso ao localStorage com JSON parse/stringify
=================================================== */
const Storage = {
    get(key, fallback = []) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : fallback;
        } catch {
            return fallback;
        }
    },
    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }
};

/* ===================================================
   MÓDULO: Books
   Gerencia o array de livros no localStorage.
   Cada livro: { id, titulo, isbn, autor, editora,
                 categoria, ano, descricao, status }
=================================================== */
const Books = {
    KEY: 'sgb_books',

    getAll() {
        return Storage.get(this.KEY, []);
    },

    save(books) {
        Storage.set(this.KEY, books);
    },

    add(data) {
        const books = this.getAll();
        const id = Date.now();
        books.push({ id, ...data, status: 'disponivel' });
        this.save(books);
        return id;
    },

    update(id, data) {
        const books = this.getAll().map(b =>
            b.id === id ? { ...b, ...data } : b
        );
        this.save(books);
    },

    delete(id) {
        this.save(this.getAll().filter(b => b.id !== id));
    },

    getById(id) {
        return this.getAll().find(b => b.id === id) || null;
    },

    /** Marca livro como emprestado ou disponível */
    setStatus(id, status) {
        this.update(id, { status });
    },

    /** Retorna livros disponíveis (para seleção no modal de empréstimo) */
    getAvailable() {
        return this.getAll().filter(b => b.status === 'disponivel');
    }
};

/* ===================================================
   MÓDULO: Loans
   Gerencia o array de empréstimos no localStorage.
   Cada empréstimo: { id, userId, bookId, bookTitle,
                      userName, saida, prazo, status }
=================================================== */
const Loans = {
    KEY: 'sgb_loans',

    getAll() {
        return Storage.get(this.KEY, []);
    },

    save(loans) {
        Storage.set(this.KEY, loans);
    },

    add(data) {
        const loans = this.getAll();
        const id = Date.now();
        loans.push({ id, ...data, status: 'no_prazo' });
        this.save(loans);
        return id;
    },

    /** Recalcula o status de todos os empréstimos ativos com base na data atual */
    refreshStatus() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const loans = this.getAll().map(loan => {
            if (loan.status === 'devolvido') return loan;
            const prazo = new Date(loan.prazo + 'T00:00:00');
            return { ...loan, status: prazo < today ? 'atrasado' : 'no_prazo' };
        });
        this.save(loans);
        return loans;
    },

    /** Marca um empréstimo como devolvido e libera o livro */
    return(loanId) {
        const loans = this.getAll().map(l =>
            l.id === loanId ? { ...l, status: 'devolvido' } : l
        );
        this.save(loans);

        // Libera o livro
        const loan = this.getAll().find(l => l.id === loanId);
        if (loan) Books.setStatus(loan.bookId, 'disponivel');
    },

    delete(id) {
        const loan = this.getAll().find(l => l.id === id);
        // Ao excluir, libera o livro se não devolvido
        if (loan && loan.status !== 'devolvido') {
            Books.setStatus(loan.bookId, 'disponivel');
        }
        this.save(this.getAll().filter(l => l.id !== id));
    },

    getActive() {
        return this.getAll().filter(l => l.status !== 'devolvido');
    },

    getOverdue() {
        return this.getAll().filter(l => l.status === 'atrasado');
    }
};

/* ===================================================
   MÓDULO: Toast
   Exibe notificações flutuantes não-bloqueantes.
   tipos: 'success' | 'error' | 'warning' | 'info'
=================================================== */
const Toast = {
    icons: {
        success: 'fa-check',
        error:   'fa-times',
        warning: 'fa-exclamation',
        info:    'fa-info'
    },

    show(title, message = '', type = 'info', duration = 3500) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        toast.innerHTML = `
            <div class="toast-icon"><i class="fas ${this.icons[type] || 'fa-info'}"></i></div>
            <div>
                <div class="toast-title">${title}</div>
                ${message ? `<div class="toast-msg">${message}</div>` : ''}
            </div>
        `;

        container.appendChild(toast);

        // Remove após duração
        setTimeout(() => {
            toast.classList.add('toast-out');
            toast.addEventListener('animationend', () => toast.remove());
        }, duration);
    },

    success(title, msg) { this.show(title, msg, 'success'); },
    error(title, msg)   { this.show(title, msg, 'error'); },
    warning(title, msg) { this.show(title, msg, 'warning'); },
    info(title, msg)    { this.show(title, msg, 'info'); }
};

/* ===================================================
   MÓDULO: Validation
   Valida campos de formulário e exibe feedbacks.
=================================================== */
const Validation = {
    /** Limpa todos os erros visíveis em um formulário */
    clearErrors(fieldIds) {
        fieldIds.forEach(id => {
            const input = document.getElementById(id);
            const err   = document.getElementById(`err-${id}`);
            if (input) input.classList.remove('error');
            if (err)   err.textContent = '';
        });
    },

    /** Define erro em campo específico */
    setError(fieldId, message) {
        const input = document.getElementById(fieldId);
        const err   = document.getElementById(`err-${fieldId}`);
        if (input) input.classList.add('error');
        if (err)   err.textContent = message;
    },

    /** Valida ISBN-13: deve ter 13 dígitos (com ou sem hifens) */
    isValidISBN(isbn) {
        if (!isbn) return true; // opcional
        const digits = isbn.replace(/[- ]/g, '');
        if (!/^\d{13}$/.test(digits)) return false;

        // Cálculo do dígito verificador ISBN-13
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 3);
        }
        const check = (10 - (sum % 10)) % 10;
        return check === parseInt(digits[12]);
    },

    /** Valida formulário de livro; retorna true se válido */
    validateBook() {
        const fields = ['titulo', 'isbn', 'autor', 'categoria'];
        this.clearErrors(fields);
        let valid = true;

        const titulo   = document.getElementById('titulo').value.trim();
        const isbn     = document.getElementById('isbn').value.trim();
        const autor    = document.getElementById('autor').value.trim();
        const categoria = document.getElementById('categoria').value;

        if (!titulo) {
            this.setError('titulo', 'O título é obrigatório.');
            valid = false;
        }

        if (!autor) {
            this.setError('autor', 'O autor é obrigatório.');
            valid = false;
        }

        if (!categoria) {
            this.setError('categoria', 'Selecione uma categoria.');
            valid = false;
        }

        if (isbn && !this.isValidISBN(isbn)) {
            this.setError('isbn', 'ISBN-13 inválido. Verifique os 13 dígitos.');
            valid = false;
        }

        return valid;
    },

    /** Valida formulário de empréstimo */
    validateLoan() {
        const fields = ['loanUser', 'loanBook'];
        this.clearErrors(fields);
        let valid = true;

        const user = document.getElementById('loanUser').value.trim();
        const book = document.getElementById('loanBook').value;
        const date = document.getElementById('loanDate').value;
        const due  = document.getElementById('loanDue').value;

        if (!user) {
            this.setError('loanUser', 'Informe o nome do usuário.');
            valid = false;
        }

        if (!book) {
            this.setError('loanBook', 'Selecione um livro.');
            valid = false;
        }

        if (!date || !due) {
            Toast.warning('Campos obrigatórios', 'Preencha as datas de saída e devolução.');
            valid = false;
        } else if (due < date) {
            Toast.error('Data inválida', 'A devolução não pode ser anterior à saída.');
            valid = false;
        }

        return valid;
    }
};

/* ===================================================
   MÓDULO: UI
   Funções de renderização (DOM manipulation)
=================================================== */
const UI = {

    /** Gera badge HTML baseado no status */
    badgeBook(status) {
        if (status === 'disponivel') return '<span class="badge badge-success">Disponível</span>';
        return '<span class="badge badge-danger">Emprestado</span>';
    },

    badgeLoan(status) {
        const map = {
            no_prazo:  '<span class="badge badge-success">No Prazo</span>',
            atrasado:  '<span class="badge badge-danger">Atrasado</span>',
            devolvido: '<span class="badge badge-accent">Devolvido</span>'
        };
        return map[status] || '<span class="badge badge-info">—</span>';
    },

    /** Formata data YYYY-MM-DD → DD/MM/YYYY */
    formatDate(str) {
        if (!str) return '—';
        const [y, m, d] = str.split('-');
        return `${d}/${m}/${y}`;
    },

    /** Renderiza a tabela de livros (acervo) */
    renderBooksTable(books) {
        const tbody = document.getElementById('booksTableBody');
        const count = document.getElementById('acervoCount');

        if (count) count.textContent = `${books.length} livro${books.length !== 1 ? 's' : ''}`;

        if (!books.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-row"><i class="fas fa-inbox"></i> Nenhum livro encontrado.</td></tr>`;
            return;
        }

        tbody.innerHTML = books.map(b => `
            <tr>
                <td><span class="book-id">#${String(b.id).slice(-4)}</span></td>
                <td><strong>${b.titulo}</strong>${b.editora ? `<br><small style="color:var(--text-soft)">${b.editora}</small>` : ''}</td>
                <td>${b.autor}</td>
                <td><span class="badge badge-accent">${b.categoria}</span></td>
                <td>${this.badgeBook(b.status)}</td>
                <td>
                    <div class="actions-cell">
                        <button class="btn-icon" title="Editar" onclick="editBook(${b.id})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn-icon btn-icon-danger" title="Excluir" onclick="confirmDeleteBook(${b.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                        ${b.status === 'disponivel'
                            ? `<button class="btn-icon btn-icon-success" title="Emprestar" onclick="openLoanModalForBook(${b.id})">
                                   <i class="fas fa-exchange-alt"></i>
                               </button>`
                            : ''
                        }
                    </div>
                </td>
            </tr>
        `).join('');
    },

    /** Renderiza a tabela de empréstimos */
    renderLoansTable(loans) {
        const tbody = document.getElementById('loansTableBody');
        const count = document.getElementById('loansCount');

        if (count) count.textContent = `${loans.length} registro${loans.length !== 1 ? 's' : ''}`;

        if (!loans.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-row"><i class="fas fa-inbox"></i> Nenhum empréstimo encontrado.</td></tr>`;
            return;
        }

        tbody.innerHTML = loans.map(l => `
            <tr>
                <td><strong>${l.userName}</strong></td>
                <td>${l.bookTitle}</td>
                <td>${this.formatDate(l.saida)}</td>
                <td>${this.formatDate(l.prazo)}</td>
                <td>${this.badgeLoan(l.status)}</td>
                <td>
                    <div class="actions-cell">
                        ${l.status !== 'devolvido'
                            ? `<button class="btn-icon btn-icon-success" title="Registrar Devolução" onclick="confirmReturn(${l.id})">
                                   <i class="fas fa-undo"></i>
                               </button>`
                            : ''
                        }
                        <button class="btn-icon btn-icon-danger" title="Excluir" onclick="confirmDeleteLoan(${l.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    /** Renderiza os últimos 5 empréstimos no dashboard */
    renderDashLoans() {
        const tbody = document.getElementById('dashLoansBody');
        Loans.refreshStatus();
        const loans = Loans.getAll().slice(-5).reverse();

        if (!loans.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="empty-row"><i class="fas fa-inbox"></i> Nenhum empréstimo registrado.</td></tr>`;
            return;
        }

        tbody.innerHTML = loans.map(l => `
            <tr>
                <td>${l.userName}</td>
                <td>${l.bookTitle}</td>
                <td>${this.formatDate(l.prazo)}</td>
                <td>${this.badgeLoan(l.status)}</td>
            </tr>
        `).join('');
    },

    /** Preenche o select de livros disponíveis no modal de empréstimo */
    populateAvailableBooks(preselect = null) {
        const select = document.getElementById('loanBook');
        const available = Books.getAvailable();

        select.innerHTML = '<option value="">— Selecione um livro disponível —</option>';
        available.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = `${b.titulo} — ${b.autor}`;
            if (preselect && b.id === preselect) opt.selected = true;
            select.appendChild(opt);
        });
    }
};

/* ===================================================
   MÓDULO: Dashboard
   Atualiza os cards estatísticos dinamicamente
=================================================== */
const Dashboard = {
    refresh() {
        const books = Books.getAll();
        Loans.refreshStatus();

        document.getElementById('statTotal').textContent       = books.length;
        document.getElementById('statDisponiveis').textContent = books.filter(b => b.status === 'disponivel').length;
        document.getElementById('statEmprestados').textContent = books.filter(b => b.status === 'emprestado').length;
        document.getElementById('statAtrasados').textContent   = Loans.getOverdue().length;

        UI.renderDashLoans();
    }
};

/* ===================================================
   MÓDULO: Navigation
   Controla a navegação entre seções e o menu mobile
=================================================== */

/**
 * Exibe uma seção e marca o botão como ativo.
 * Recarrega dados da seção quando ela é aberta.
 */
function showSection(id, btn) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    // O btn pode ser o elemento ou inferido pelo data-section
    const activeBtn = btn || document.querySelector(`[data-section="${id}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Atualiza título mobile
    const titles = {
        dashboard: 'Dashboard',
        cadastro:  'Novo Livro',
        consulta:  'Acervo',
        emprestimo:'Empréstimos'
    };
    const mobileTitle = document.getElementById('mobileTitle');
    if (mobileTitle) mobileTitle.textContent = titles[id] || '';

    // Recarrega dados conforme seção ativa
    if (id === 'dashboard')  Dashboard.refresh();
    if (id === 'consulta')   renderBooksPage();
    if (id === 'emprestimo') renderLoansPage();

    closeSidebar();
}

function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('open');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
}

document.getElementById('sidebarClose').addEventListener('click', closeSidebar);

/* ===================================================
   FUNÇÕES DE LIVRO (Cadastro / Consulta)
=================================================== */

/** Limpa o formulário de cadastro e reseta para modo de criação */
function clearForm() {
    ['titulo', 'isbn', 'autor', 'editora', 'categoria', 'ano', 'descricao'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('editId').value = '';
    document.getElementById('formTitle').textContent = 'Novo Registro';
    document.getElementById('formMode').textContent = 'Cadastro';
    document.getElementById('formMode').className = 'badge badge-info';
    document.getElementById('btnDelete').style.display = 'none';

    const feedback = document.getElementById('formFeedback');
    feedback.style.display = 'none';

    Validation.clearErrors(['titulo', 'isbn', 'autor', 'categoria']);
}

/**
 * Salva ou atualiza um livro.
 * Detecta modo edição pelo campo oculto #editId.
 */
function handleSave() {
    if (!Validation.validateBook()) return;

    const data = {
        titulo:    document.getElementById('titulo').value.trim(),
        isbn:      document.getElementById('isbn').value.trim(),
        autor:     document.getElementById('autor').value.trim(),
        editora:   document.getElementById('editora').value.trim(),
        categoria: document.getElementById('categoria').value,
        ano:       document.getElementById('ano').value.trim(),
        descricao: document.getElementById('descricao').value.trim()
    };

    const editId = document.getElementById('editId').value;

    if (editId) {
        // Modo edição: preserva o status atual do livro
        Books.update(parseInt(editId), data);
        Toast.success('Livro atualizado!', `"${data.titulo}" foi atualizado no acervo.`);
    } else {
        // Novo cadastro
        Books.add(data);
        Toast.success('Livro cadastrado!', `"${data.titulo}" foi adicionado ao acervo.`);
    }

    clearForm();
    Dashboard.refresh();
}

/**
 * Carrega dados de um livro no formulário para edição.
 */
function editBook(id) {
    const book = Books.getById(id);
    if (!book) return;

    document.getElementById('titulo').value    = book.titulo || '';
    document.getElementById('isbn').value      = book.isbn || '';
    document.getElementById('autor').value     = book.autor || '';
    document.getElementById('editora').value   = book.editora || '';
    document.getElementById('categoria').value = book.categoria || '';
    document.getElementById('ano').value       = book.ano || '';
    document.getElementById('descricao').value = book.descricao || '';
    document.getElementById('editId').value    = book.id;

    document.getElementById('formTitle').textContent = 'Editar Registro';
    document.getElementById('formMode').textContent  = 'Edição';
    document.getElementById('formMode').className    = 'badge badge-warning';
    document.getElementById('btnDelete').style.display = 'inline-flex';

    showSection('cadastro', document.querySelector('[data-section="cadastro"]'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Confirma exclusão do livro em edição */
function handleDelete() {
    const id = parseInt(document.getElementById('editId').value);
    if (!id) return;

    openConfirmModal(
        'Excluir este livro permanentemente?',
        () => {
            // Verifica se há empréstimo ativo
            const hasLoan = Loans.getActive().some(l => l.bookId === id);
            if (hasLoan) {
                Toast.error('Não permitido', 'Este livro possui empréstimo ativo.');
                return;
            }
            Books.delete(id);
            clearForm();
            Dashboard.refresh();
            Toast.success('Livro excluído!', 'O registro foi removido do acervo.');
        }
    );
}

/** Confirma exclusão de livro diretamente da tabela */
function confirmDeleteBook(id) {
    const book = Books.getById(id);
    if (!book) return;

    openConfirmModal(
        `Excluir "${book.titulo}"?`,
        () => {
            const hasLoan = Loans.getActive().some(l => l.bookId === id);
            if (hasLoan) {
                Toast.error('Não permitido', 'Este livro possui empréstimo ativo.');
                return;
            }
            Books.delete(id);
            renderBooksPage();
            Dashboard.refresh();
            Toast.success('Livro excluído!', 'O registro foi removido do acervo.');
        }
    );
}

/** Renderiza a tabela do acervo com filtros aplicados */
function renderBooksPage() {
    const books = Books.getAll();
    const count = document.getElementById('acervoCount');
    if (count) count.textContent = `${books.length} livro${books.length !== 1 ? 's' : ''}`;
    UI.renderBooksTable(books);
}

/** Filtra livros em tempo real por texto, categoria e status */
function filterBooks() {
    const q    = document.getElementById('searchInput').value.toLowerCase().trim();
    const cat  = document.getElementById('filterCategoria').value;
    const st   = document.getElementById('filterStatus').value;
    const clear = document.getElementById('searchClear');
    if (clear) clear.style.display = q ? 'block' : 'none';

    let books = Books.getAll();

    if (q) books = books.filter(b =>
        b.titulo.toLowerCase().includes(q) ||
        b.autor.toLowerCase().includes(q) ||
        (b.isbn && b.isbn.includes(q))
    );

    if (cat) books = books.filter(b => b.categoria === cat);
    if (st)  books = books.filter(b => b.status === st);

    UI.renderBooksTable(books);
}

/** Limpa campo de busca e re-renderiza */
function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').style.display = 'none';
    filterBooks();
}

/* ===================================================
   FUNÇÕES DE EMPRÉSTIMO
=================================================== */

/** Abre o modal de empréstimo com datas padrão preenchidas */
function openLoanModal(preselect = null) {
    const available = Books.getAvailable();
    if (!available.length) {
        Toast.warning('Sem livros', 'Não há livros disponíveis para empréstimo.');
        return;
    }

    UI.populateAvailableBooks(preselect);

    // Data de hoje como padrão para saída
    const today = new Date().toISOString().split('T')[0];
    const due   = new Date();
    due.setDate(due.getDate() + 14); // 14 dias por padrão
    const dueStr = due.toISOString().split('T')[0];

    document.getElementById('loanDate').value = today;
    document.getElementById('loanDue').value  = dueStr;
    document.getElementById('loanUser').value = '';
    Validation.clearErrors(['loanUser', 'loanBook']);

    document.getElementById('loanModal').style.display = 'flex';
}

/** Atalho: abre modal com livro pré-selecionado */
function openLoanModalForBook(bookId) {
    openLoanModal(bookId);
}

function closeLoanModal() {
    document.getElementById('loanModal').style.display = 'none';
}

/** Salva um novo empréstimo */
function saveLoan() {
    if (!Validation.validateLoan()) return;

    const bookId    = parseInt(document.getElementById('loanBook').value);
    const book      = Books.getById(bookId);
    const userName  = document.getElementById('loanUser').value.trim();
    const saida     = document.getElementById('loanDate').value;
    const prazo     = document.getElementById('loanDue').value;

    Loans.add({
        bookId,
        bookTitle: book.titulo,
        userName,
        saida,
        prazo
    });

    Books.setStatus(bookId, 'emprestado');
    closeLoanModal();
    renderLoansPage();
    Dashboard.refresh();
    Toast.success('Empréstimo registrado!', `"${book.titulo}" emprestado para ${userName}.`);
}

/** Confirma devolução de um livro */
function confirmReturn(loanId) {
    const loan = Loans.getAll().find(l => l.id === loanId);
    if (!loan) return;

    openConfirmModal(
        `Confirmar devolução de "${loan.bookTitle}"?`,
        () => {
            Loans.return(loanId);
            renderLoansPage();
            Dashboard.refresh();
            Toast.success('Devolução registrada!', `"${loan.bookTitle}" está disponível novamente.`);
        }
    );
}

/** Confirma exclusão de empréstimo */
function confirmDeleteLoan(id) {
    openConfirmModal(
        'Excluir este registro de empréstimo?',
        () => {
            Loans.delete(id);
            renderLoansPage();
            Dashboard.refresh();
            Toast.info('Registro removido.', '');
        }
    );
}

/** Renderiza tabela de empréstimos com filtros */
function renderLoansPage() {
    Loans.refreshStatus();
    UI.renderLoansTable(Loans.getAll());
}

/** Filtra empréstimos por texto e status */
function filterLoans() {
    const q  = document.getElementById('searchLoan').value.toLowerCase().trim();
    const st = document.getElementById('filterLoanStatus').value;
    Loans.refreshStatus();

    let loans = Loans.getAll();

    if (q) loans = loans.filter(l =>
        l.userName.toLowerCase().includes(q) ||
        l.bookTitle.toLowerCase().includes(q)
    );

    if (st) loans = loans.filter(l => l.status === st);

    UI.renderLoansTable(loans);
    const count = document.getElementById('loansCount');
    if (count) count.textContent = `${loans.length} registro${loans.length !== 1 ? 's' : ''}`;
}

/* ===================================================
   MÓDULO: Modal de Confirmação
   Reutilizável para qualquer ação destrutiva
=================================================== */
let _confirmCallback = null;

function openConfirmModal(message, callback) {
    document.getElementById('confirmMessage').textContent = message;
    _confirmCallback = callback;
    document.getElementById('confirmModal').style.display = 'flex';
}

function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
    _confirmCallback = null;
}

document.getElementById('confirmBtn').addEventListener('click', () => {
    if (_confirmCallback) _confirmCallback();
    closeConfirmModal();
});

// Fecha modais ao clicar fora
document.getElementById('loanModal').addEventListener('click', function(e) {
    if (e.target === this) closeLoanModal();
});

document.getElementById('confirmModal').addEventListener('click', function(e) {
    if (e.target === this) closeConfirmModal();
});

/* ===================================================
   INICIALIZAÇÃO
   Executado quando o DOM estiver pronto
=================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Injeta dados de exemplo se o localStorage estiver vazio
    if (!Books.getAll().length) {
        seedDemoData();
    }

    // Exibe data atual nos elementos de data
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });

    const dashDate = document.getElementById('dashDate');
    const currentDate = document.getElementById('currentDate');
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    if (dashDate)    dashDate.textContent    = cap(dateStr);
    if (currentDate) currentDate.textContent = now.toLocaleDateString('pt-BR');

    // Máscara simples de ISBN (insere hifens automaticamente)
    const isbnInput = document.getElementById('isbn');
    if (isbnInput) {
        isbnInput.addEventListener('input', function() {
            // Remove não-dígitos e re-formata
            let digits = this.value.replace(/\D/g, '').slice(0, 13);
            this.value = digits;
        });
    }

    // Carrega o Dashboard
    Dashboard.refresh();
});

/* ===================================================
   DADOS DE DEMONSTRAÇÃO
   Populados na primeira vez que o sistema é aberto
=================================================== */
function seedDemoData() {
    const sampleBooks = [
        { titulo: 'Código Limpo', isbn: '9780132350884', autor: 'Robert C. Martin', editora: 'Pearson', categoria: 'Tecnologia', ano: '2008', descricao: 'Guia sobre boas práticas de programação.' },
        { titulo: 'Algoritmos e Estrutura de Dados', isbn: '9788521618287', autor: 'Guimarães & Lages', editora: 'LTC', categoria: 'Tecnologia', ano: '1994', descricao: 'Introdução a algoritmos e estruturas de dados.' },
        { titulo: 'Dom Casmurro', isbn: '9788535910582', autor: 'Machado de Assis', editora: 'FTD', categoria: 'Literatura Brasileira', ano: '1899', descricao: 'Clássico da literatura brasileira do realismo.' },
        { titulo: 'Engenharia de Software', isbn: '9788564574304', autor: 'Ian Sommerville', editora: 'Pearson', categoria: 'Tecnologia', ano: '2016', descricao: 'Princípios e práticas da engenharia de software.' },
        { titulo: 'O Alienista', isbn: '9788535907391', autor: 'Machado de Assis', editora: 'Ática', categoria: 'Literatura Brasileira', ano: '1882', descricao: 'Novela clássica do realismo brasileiro.' },
    ];

    sampleBooks.forEach(b => Books.add(b));

    // Adiciona empréstimos de exemplo
    const books = Books.getAll();
    if (books.length >= 2) {
        const today = new Date();
        const past  = new Date(today); past.setDate(past.getDate() - 10);
        const dueOk = new Date(today); dueOk.setDate(dueOk.getDate() + 4);
        const dueOld = new Date(today); dueOld.setDate(dueOld.getDate() - 3);

        Loans.add({
            bookId: books[0].id,
            bookTitle: books[0].titulo,
            userName: 'Rafael Alves',
            saida: past.toISOString().split('T')[0],
            prazo: dueOk.toISOString().split('T')[0]
        });
        Books.setStatus(books[0].id, 'emprestado');

        Loans.add({
            bookId: books[2].id,
            bookTitle: books[2].titulo,
            userName: 'Maria Oliveira',
            saida: past.toISOString().split('T')[0],
            prazo: dueOld.toISOString().split('T')[0]
        });
        Books.setStatus(books[2].id, 'emprestado');

        Loans.refreshStatus();
    }
}

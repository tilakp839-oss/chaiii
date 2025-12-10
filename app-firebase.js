/**
 * Open Eyes Vote - Firebase Frontend Application with Full Features
 */

const STORAGE_KEYS = {
    USERS: 'brewvote_users',
    VOTES: 'brewvote_votes',
    SESSIONS: 'brewvote_sessions',
    CURRENT_USER: 'brewvote_current_user'
};

const SESSION_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// Mock Admin Data
const ADMIN_USER = {
    id: 'admin-1',
    name: 'Event Manager',
    employeeId: 'ADM001',
    role: 'ADMIN'
};

/**
 * Application State & Logic
 */
const app = {
    user: null,
    loginMode: 'EMPLOYEE',
    chartInstance: null,
    pollInterval: null,
    timerInterval: null,
    lastSessionId: null,

    init: async () => {
        // Initialize Storage if empty
        if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify([ADMIN_USER]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.SESSIONS)) {
            localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.VOTES)) {
            localStorage.setItem(STORAGE_KEYS.VOTES, JSON.stringify([]));
        }

        // Check Auth from localStorage
        const storedUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        if (storedUser) {
            app.user = JSON.parse(storedUser);
            app.navigate();
        } else {
            app.showView('view-login');
        }

        // Initialize Icons
        lucide.createIcons();
    },

    /* --- Navigation & Views --- */
    
    showView: (viewId) => {
        // Hide all views
        document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
        // Show target
        document.getElementById(viewId).classList.remove('hidden');
        
        // Header visibility
        const header = document.getElementById('main-header');
        if (viewId === 'view-login') {
            header.style.display = 'none';
        } else {
            header.style.display = 'block';
            document.getElementById('header-user-name').textContent = app.user.name;
            document.getElementById('header-user-role').textContent = app.user.role;
        }

        lucide.createIcons();
    },

    navigate: () => {
        if (!app.user) return app.showView('view-login');
        
        if (app.user.role === 'ADMIN') {
            app.showView('view-admin');
            app.initAdminDashboard();
        } else {
            app.showView('view-employee');
            app.initEmployeeDashboard();
        }
    },

    /* --- Authentication --- */

    setLoginMode: (mode) => {
        app.loginMode = mode;
        const btnEmp = document.getElementById('btn-role-employee');
        const btnAdm = document.getElementById('btn-role-admin');
        const nameField = document.getElementById('field-name');
        const inputId = document.getElementById('input-id');

        if (mode === 'ADMIN') {
            btnAdm.classList.replace('text-gray-500', 'bg-white');
            btnAdm.classList.add('shadow-md', 'text-indigo-600');
            btnEmp.classList.remove('bg-white', 'shadow-md', 'text-indigo-600');
            btnEmp.classList.add('text-gray-500');
            
            nameField.classList.add('hidden');
            inputId.placeholder = 'ADM001';
        } else {
            btnEmp.classList.replace('text-gray-500', 'bg-white');
            btnEmp.classList.add('shadow-md', 'text-indigo-600');
            btnAdm.classList.remove('bg-white', 'shadow-md', 'text-indigo-600');
            btnAdm.classList.add('text-gray-500');

            nameField.classList.remove('hidden');
            inputId.placeholder = 'EMP...';
        }
    },

    handleLogin: (e) => {
        e.preventDefault();
        const id = document.getElementById('input-id').value;
        const name = document.getElementById('input-name').value;
        const errorMsg = document.getElementById('login-error');

        if (!id) return;

        // Admin Check - Fixed credentials
        if (app.loginMode === 'ADMIN') {
            // Admin: ID = oe10 (password field not used for admin)
            if (id === 'oe10') {
                app.user = ADMIN_USER;
                localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(app.user));
                errorMsg.classList.add('hidden');
                app.navigate();
                return;
            }
        } else {
            // Employee Check/Register - Code based access
            // Employee: Use any ID, enter the code in password field
            // Code will be updated by admin
            let users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
            let user = users.find(u => u.employeeId === id);

            if (!user && name) {
                user = { id: crypto.randomUUID(), name: name, employeeId: id, role: 'EMPLOYEE' };
                users.push(user);
                localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
            }

            if (user) {
                app.user = user;
                localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(app.user));
                errorMsg.classList.add('hidden');
                app.navigate();
                return;
            }
        }

        errorMsg.classList.remove('hidden');
    },

    logout: () => {
        app.user = null;
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        clearInterval(app.pollInterval);
        clearInterval(app.timerInterval);
        app.showView('view-login');
    },

    /* --- Employee Logic --- */

    initEmployeeDashboard: () => {
        app.checkEmployeeStatus();
        app.pollInterval = setInterval(app.checkEmployeeStatus, 5000);
        
        // Check Notification Permission
        if (Notification.permission === 'default') {
            document.getElementById('notification-permission-card').classList.remove('hidden');
        }
    },

    requestNotificationPermission: () => {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                document.getElementById('notification-permission-card').classList.add('hidden');
                app.showToast('Notifications enabled!', 'success');
            }
        });
    },

    checkEmployeeStatus: () => {
        const session = app.getActiveSession();
        const waitView = document.getElementById('emp-state-waiting');
        const voteView = document.getElementById('emp-state-voting');
        const votedView = document.getElementById('emp-state-voted');

        // Check for new session start (Notification)
        if (session && session.id !== app.lastSessionId) {
            if (app.lastSessionId !== null) { // Don't notify on first load
                app.showToast('🔔 Voting has started!', 'info');
                if (Notification.permission === 'granted') {
                    new Notification("Open Eyes Vote", { body: "Voting started! Coffee or Tea?" });
                }
            }
        }
        app.lastSessionId = session ? session.id : null;

        if (!session) {
            waitView.classList.remove('hidden');
            voteView.classList.add('hidden');
            votedView.classList.add('hidden');
            return;
        }

        // Check if voted
        const votes = JSON.parse(localStorage.getItem(STORAGE_KEYS.VOTES) || '[]');
        const myVote = votes.find(v => v.sessionId === session.id && v.userId === app.user.id);

        if (myVote) {
            waitView.classList.add('hidden');
            voteView.classList.add('hidden');
            votedView.classList.remove('hidden');
            
            // Update Voted UI
            const text = document.getElementById('voted-selection-text');
            const icon = document.getElementById('voted-icon');
            const container = document.getElementById('voted-icon-container');
            const ping = document.getElementById('voted-ping');

            text.textContent = myVote.type;
            if (myVote.type === 'COFFEE') {
                container.className = "relative p-10 rounded-full shadow-2xl bg-gradient-to-br from-amber-100 to-amber-200";
                icon.setAttribute('class', 'w-20 h-20 text-amber-600');
                text.className = "px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wider bg-amber-100 text-amber-700";
                ping.className = "absolute inset-0 rounded-full animate-ping opacity-20 bg-amber-400";
            } else {
                container.className = "relative p-10 rounded-full shadow-2xl bg-gradient-to-br from-emerald-100 to-emerald-200";
                icon.setAttribute('class', 'w-20 h-20 text-emerald-600');
                text.className = "px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700";
                ping.className = "absolute inset-0 rounded-full animate-ping opacity-20 bg-emerald-400";
            }
        } else {
            waitView.classList.add('hidden');
            voteView.classList.remove('hidden');
            votedView.classList.add('hidden');
        }
        lucide.createIcons();
    },

    castVote: (type) => {
        const session = app.getActiveSession();
        if (!session) return;

        const votes = JSON.parse(localStorage.getItem(STORAGE_KEYS.VOTES) || '[]');
        const newVote = {
            id: crypto.randomUUID(),
            sessionId: session.id,
            userId: app.user.id,
            userName: app.user.name,
            type: type,
            timestamp: new Date().toISOString()
        };

        votes.push(newVote);
        localStorage.setItem(STORAGE_KEYS.VOTES, JSON.stringify(votes));

        // Update session count
        const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
        const idx = sessions.findIndex(s => s.id === session.id);
        if (idx !== -1) {
            sessions[idx].totalVotes++;
            localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
        }

        app.showToast('Vote Cast Successfully!', 'success');
        app.checkEmployeeStatus();
    },

    /* --- Admin Logic --- */

    initAdminDashboard: () => {
        app.updateAdminUI();
        app.renderHistory();
        app.renderChart();
        app.pollInterval = setInterval(() => {
            app.updateAdminUI();
            app.renderChart(); // Refresh chart live
        }, 1000);
    },

    updateAdminUI: () => {
        const session = app.getActiveSession();
        const activeControls = document.getElementById('admin-controls-active');
        const idleControls = document.getElementById('admin-controls-idle');
        const liveStats = document.getElementById('admin-live-stats');
        
        // Calculate Totals
        const votes = JSON.parse(localStorage.getItem(STORAGE_KEYS.VOTES) || '[]');
        const coffeeTotal = votes.filter(v => v.type === 'COFFEE').length;
        const teaTotal = votes.filter(v => v.type === 'TEA').length;
        
        document.getElementById('total-coffee').textContent = coffeeTotal;
        document.getElementById('total-tea').textContent = teaTotal;

        if (session) {
            activeControls.classList.remove('hidden');
            activeControls.classList.add('flex');
            idleControls.classList.add('hidden');
            liveStats.classList.remove('hidden');
            liveStats.classList.add('grid');

            // Timer
            const start = new Date(session.startTime).getTime();
            const now = new Date().getTime();
            const diff = (start + SESSION_DURATION_MS) - now;

            if (diff <= 0) {
                app.endSession();
                return;
            }

            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            document.getElementById('timer-display').textContent = `${m}m ${s}s`;

            // Live Stats
            const sessionVotes = votes.filter(v => v.sessionId === session.id);
            const c = sessionVotes.filter(v => v.type === 'COFFEE').length;
            const t = sessionVotes.filter(v => v.type === 'TEA').length;
            const total = c + t;

            document.getElementById('live-count-coffee').textContent = c;
            document.getElementById('live-count-tea').textContent = t;
            
            document.getElementById('live-bar-coffee').style.height = total > 0 ? `${(c/total)*100}%` : '0%';
            document.getElementById('live-bar-tea').style.height = total > 0 ? `${(t/total)*100}%` : '0%';

            // Pending Users
            const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
            const employees = users.filter(u => u.role === 'EMPLOYEE');
            const votedIds = new Set(sessionVotes.map(v => v.userId));
            const pending = employees.filter(u => !votedIds.has(u.id));

            document.getElementById('pending-count-badge').textContent = pending.length;
            const pendingContainer = document.getElementById('pending-users-list');
            
            if (pending.length === 0) {
                pendingContainer.innerHTML = '<span class="text-emerald-600 text-sm font-bold w-full text-center">All votes cast!</span>';
            } else {
                pendingContainer.innerHTML = pending.map(u => `
                    <span class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-600 shadow-sm">
                        <span class="w-2 h-2 rounded-full bg-gray-300 mr-2"></span>${u.name}
                    </span>
                `).join('');
            }

        } else {
            activeControls.classList.add('hidden');
            activeControls.classList.remove('flex');
            idleControls.classList.remove('hidden');
            liveStats.classList.add('hidden');
            liveStats.classList.remove('grid');
        }
    },

    startSession: () => {
        const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
        
        // Deactivate others
        sessions.forEach(s => { s.isActive = false; });

        const newSession = {
            id: crypto.randomUUID(),
            startTime: new Date().toISOString(),
            isActive: true,
            totalVotes: 0
        };

        sessions.unshift(newSession);
        localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
        
        app.showToast('Session Started!', 'success');
        app.updateAdminUI();
        app.renderHistory();
    },

    endSession: () => {
        const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
        const session = sessions.find(s => s.isActive);
        
        if (session) {
            session.isActive = false;
            session.endTime = new Date().toISOString();
            localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
        }
        
        app.showToast('Session Ended', 'info');
        app.updateAdminUI();
        app.renderHistory();
    },

    renderChart: () => {
        const ctx = document.getElementById('trendsChart').getContext('2d');
        const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
        const votes = JSON.parse(localStorage.getItem(STORAGE_KEYS.VOTES) || '[]');
        
        const recent = sessions.slice(0, 7).reverse();
        const labels = recent.map(s => {
            const d = new Date(s.startTime);
            return `${d.getMonth()+1}/${d.getDate()}`;
        });
        
        const dataCoffee = recent.map(s => votes.filter(v => v.sessionId === s.id && v.type === 'COFFEE').length);
        const dataTea = recent.map(s => votes.filter(v => v.sessionId === s.id && v.type === 'TEA').length);

        if (app.chartInstance) {
            app.chartInstance.data.labels = labels;
            app.chartInstance.data.datasets[0].data = dataCoffee;
            app.chartInstance.data.datasets[1].data = dataTea;
            app.chartInstance.update();
        } else {
            app.chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'Coffee', data: dataCoffee, backgroundColor: '#d97706', borderRadius: 4 },
                        { label: 'Tea', data: dataTea, backgroundColor: '#059669', borderRadius: 4 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } },
                    scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } }
                }
            });
        }
    },

    deleteSession: (sessionId) => {
        if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
            return;
        }
        
        // Get current data
        const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
        const votes = JSON.parse(localStorage.getItem(STORAGE_KEYS.VOTES) || '[]');
        
        // Filter out the session and its votes
        const updatedSessions = sessions.filter(s => s.id !== sessionId);
        const updatedVotes = votes.filter(v => v.sessionId !== sessionId);
        
        // Save back to localStorage
        localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(updatedSessions));
        localStorage.setItem(STORAGE_KEYS.VOTES, JSON.stringify(updatedVotes));
        
        // Show success message and refresh the view
        app.showToast('Session deleted successfully', 'success');
        app.renderHistory();
        app.updateAdminUI();
    },

    renderHistory: () => {
        const tbody = document.getElementById('history-table-body');
        const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
        const history = sessions.filter(s => !s.isActive);
        const votes = JSON.parse(localStorage.getItem(STORAGE_KEYS.VOTES) || '[]');

        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-8 py-8 text-center text-gray-400">No history yet.</td></tr>';
            return;
        }

        tbody.innerHTML = history.map(s => {
            const sVotes = votes.filter(v => v.sessionId === s.id);
            const c = sVotes.filter(v => v.type === 'COFFEE').length;
            const t = sVotes.filter(v => v.type === 'TEA').length;
            const total = c + t;
            const date = new Date(s.startTime).toLocaleDateString();
            const time = new Date(s.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            // Toggle row ID
            const detailId = `detail-${s.id}`;

            return `
                <tr class="hover:bg-white/60 transition-colors border-b border-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        ${date} <span class="text-gray-400 text-xs">${time}</span>
                    </td>
                    <td class="px-4 py-4 whitespace-nowrap text-sm font-bold text-gray-900">${s.totalVotes}</td>
                    <td class="px-4 py-4 whitespace-nowrap">
                        <div class="flex items-center gap-2 text-xs">
                             <span class="text-amber-700 font-bold">${c}C</span> / <span class="text-emerald-700 font-bold">${t}T</span>
                        </div>
                    </td>
                    <td class="px-4 py-4 whitespace-nowrap">
                        <button onclick="app.toggleHistoryDetail('${detailId}')" class="text-indigo-600 text-xs font-bold hover:underline mr-4">View Details</button>
                        <button onclick="app.deleteSession('${s.id}')" class="text-red-600 text-xs font-bold hover:underline flex items-center" title="Delete Session">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5 mr-1"></i> Delete
                        </button>
                    </td>
                </tr>
                <tr id="${detailId}" class="hidden bg-gray-50/50 shadow-inner">
                    <td colspan="4" class="px-8 py-4">
                        <div class="flex flex-wrap gap-2 text-xs">
                            ${sVotes.length ? sVotes.map(v => `
                                <span class="px-2 py-1 rounded border ${v.type === 'COFFEE' ? 'bg-amber-100 border-amber-200 text-amber-800' : 'bg-emerald-100 border-emerald-200 text-emerald-800'}">
                                    ${v.userName}
                                </span>
                            `).join('') : '<span class="text-gray-400">No votes</span>'}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    toggleHistoryDetail: (id) => {
        const el = document.getElementById(id);
        el.classList.toggle('hidden');
    },

    /* --- Utilities --- */

    getActiveSession: () => {
        const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
        return sessions.find(s => s.isActive) || null;
    },

    showToast: (message, type = 'info') => {
        const container = document.getElementById('toast-container');
        const el = document.createElement('div');
        
        let colors = type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 
                     type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 
                     'bg-indigo-50 text-indigo-800 border-indigo-200';
                     
        let icon = type === 'success' ? 'check-circle-2' : type === 'error' ? 'alert-circle' : 'bell';

        el.className = `flex items-center p-4 rounded-lg shadow-lg border backdrop-blur-sm bg-opacity-95 mb-3 animate-slide-down pointer-events-auto ${colors}`;
        el.innerHTML = `
            <i data-lucide="${icon}" class="w-5 h-5 mr-3"></i>
            <span class="text-sm font-medium flex-1">${message}</span>
            <button onclick="this.parentElement.remove()" class="ml-3 opacity-50 hover:opacity-100"><i data-lucide="x" class="w-4 h-4"></i></button>
        `;

        container.appendChild(el);
        lucide.createIcons();
        setTimeout(() => { if(el) el.remove(); }, 4000);
    }
};

// Start App
document.addEventListener('DOMContentLoaded', app.init);

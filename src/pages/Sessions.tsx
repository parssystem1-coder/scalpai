import { useEffect, useState, useRef } from 'react';
import { Plus, Calendar, Clock, X, Edit2, Trash2, Check, XCircle, Search, ChevronDown } from 'lucide-react';
import { useSessionsStore, useClientsStore, useTrichologistsStore } from '../store';
import PersianCalendar from '../components/PersianCalendar';
import { formatDateForDisplay } from '../lib/jalaliDate';
import type { Session, Client } from '../db';

const STATUS_LABELS: Record<Session['status'], string> = {
  scheduled: 'scheduled',
  completed: 'completed',
  cancelled: 'cancelled',
};

export default function Sessions() {
  const { sessions, loading, fetchSessions, addSession, updateSession, deleteSession } = useSessionsStore();
  const { clients, fetchClients } = useClientsStore();
  const { trichologists, fetchTrichologists } = useTrichologistsStore();
  const isRtl = false;

  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [form, setForm] = useState<{ clientId: string; trichologistId: string; date: string; time: string; status: 'scheduled' | 'completed' | 'cancelled'; notes: string; }>({ clientId: '', trichologistId: '', date: '', time: '', status: 'scheduled', notes: '' });

  // Client search states
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const clientInputRef = useRef<HTMLInputElement>(null);

  // ارجاع اکشن‌های zustand پایدار است (یک‌بار در create ساخته می‌شوند)،
  // پس افزودنشان به deps حلقه نمی‌سازد و هشدار را ریشه‌ای می‌بندد.
  useEffect(() => {
    fetchSessions();
    fetchClients();
    fetchTrichologists();
  }, [fetchSessions, fetchClients, fetchTrichologists]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setShowClientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getClient = (id: string) => clients.find(c => c.id === id);

  // Get last 10 recently registered clients
  const getRecentClients = () => {
    return [...clients]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  };

  // بدون جستجو فقط ۱۰ مشتری اخیر؛ با جستجو حداکثر ۲۰ نتیجه تا لیست کشویی طولانی نشود
  const getFilteredClients = (): Client[] => {
    if (!clientSearchQuery.trim()) {
      return getRecentClients();
    }
    return clients
      .filter(c =>
        `${c.firstName} ${c.lastName} ${c.phone}`.toLowerCase().includes(clientSearchQuery.toLowerCase())
      )
      .slice(0, 20);
  };

  const upcomingSessions = sessions
    .filter(s => s.status === 'scheduled')
    .filter(s => {
      if (!searchQuery) return true;
      const client = getClient(s.clientId);
      return client ? `${client.firstName} ${client.lastName} ${client.phone}`.toLowerCase().includes(searchQuery.toLowerCase()) : false;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const toToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const openModal = (session?: Session) => {
    if (session) {
      setEditingSession(session);
      setForm({
        clientId: session.clientId,
        trichologistId: session.trichologistId,
        date: session.date || toToday(),
        time: session.time,
        status: session.status,
        notes: session.notes,
      });
      const client = getClient(session.clientId);
      if (client) {
        setClientSearchQuery(`${client.firstName} ${client.lastName}`);
      }
    } else {
      setEditingSession(null);
      setForm({ clientId: '', trichologistId: '', date: toToday(), time: '', status: 'scheduled', notes: '' });
      setClientSearchQuery('');
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientId) {
      alert('Please select a client');
      return;
    }
    if (!form.date?.trim()) {
      alert('Please select a session date');
      return;
    }
    const sessionData = { ...form };

    if (editingSession) {
      await updateSession(editingSession.id, sessionData);
    } else {
      await addSession(sessionData);
    }
    setShowModal(false);
  };

  const handleSelectClient = (client: Client) => {
    setForm({ ...form, clientId: client.id });
    setClientSearchQuery(`${client.firstName} ${client.lastName}`);
    setShowClientDropdown(false);
  };

  const getTrichologist = (id: string) => trichologists.find(t => t.id === id);

  const statusColors = {
    scheduled: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-green-500/20 text-green-400',
    cancelled: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 start-4 opacity-50" size={20} />
          <input
            type="text"
            placeholder="Search client..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full ps-12 pe-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button onClick={() => openModal()} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 hover:opacity-90 transition">
          <Plus size={20} />
          <span>New Session</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 opacity-50">Loading...</div>
      ) : upcomingSessions.length === 0 ? (
        <div className="text-center py-12 opacity-50">
          <Calendar size={48} className="mx-auto mb-4 opacity-30" />
          <p>No upcoming sessions</p>
        </div>
      ) : (
        <div className="space-y-4">
          {upcomingSessions.map(session => {
            const client = getClient(session.clientId);
            const tri = getTrichologist(session.trichologistId);
            return (
              <div key={session.id} className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 hover:border-blue-500/50 transition group">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                      <Calendar className="text-white" size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold">{client ? `${client.firstName} ${client.lastName}` : 'Unknown Client'}</h3>
                      <p className="text-sm opacity-50">{tri?.name || 'No Trichologist'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar size={16} className="opacity-50" />
                      <span>{formatDateForDisplay(session.date)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock size={16} className="opacity-50" />
                      <span>{session.time}</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs ${statusColors[session.status]}`}>
                      {STATUS_LABELS[session.status]}
                    </span>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => updateSession(session.id, { status: 'completed' })}
                      className="p-2 rounded-lg hover:bg-green-500/20 text-green-400"
                      title="End visit"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => updateSession(session.id, { status: 'cancelled' })}
                      className="p-2 rounded-lg hover:bg-red-500/20 text-red-400"
                      title="Cancel Session"
                    >
                      <XCircle size={16} />
                    </button>
                    <button
                      onClick={() => openModal(session)}
                      className="p-2 rounded-lg hover:bg-white/10"
                      title="Edit Session"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => deleteSession(session.id)}
                      className="p-2 rounded-lg hover:bg-red-500/20 text-red-400"
                      title="Delete Session"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-gray-800 border border-white/10 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">{editingSession ? 'Edit Session' : 'New Session'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-white/10"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Client Search with Dropdown */}
              <div className="relative" ref={clientDropdownRef}>
                <label className="block text-sm mb-2 opacity-70">
                  Select Client
                </label>
                <div className="relative">
                  <Search className="absolute top-1/2 -translate-y-1/2 start-4 opacity-50" size={18} />
                  <input
                    ref={clientInputRef}
                    type="text"
                    value={clientSearchQuery}
                    onChange={(e) => {
                      setClientSearchQuery(e.target.value);
                      setShowClientDropdown(true);
                      // Clear clientId if user is typing
                      if (form.clientId) {
                        const client = getClient(form.clientId);
                        if (client && e.target.value !== `${client.firstName} ${client.lastName}`) {
                          setForm({ ...form, clientId: '' });
                        }
                      }
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                    placeholder="Search or select client..."
                    className="w-full ps-12 pe-10 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowClientDropdown(!showClientDropdown)}
                    className="absolute top-1/2 -translate-y-1/2 end-3 opacity-50 hover:opacity-100"
                  >
                    <ChevronDown size={18} className={`transition-transform ${showClientDropdown ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Client Dropdown */}
                {showClientDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-white/20 rounded-xl shadow-2xl max-h-64 overflow-y-auto z-50">
                    {!clientSearchQuery.trim() && (
                      <div className="px-4 py-2 text-xs text-gray-400 border-b border-white/10">
                        Recent 10 clients
                      </div>
                    )}
                    {getFilteredClients().length === 0 ? (
                      <div className="px-4 py-6 text-center text-gray-400">
                        No clients found
                      </div>
                    ) : (
                      getFilteredClients().map(client => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => handleSelectClient(client)}
                          className={`w-full px-4 py-3 text-start hover:bg-white/10 transition flex items-center gap-3 ${
                            form.clientId === client.id ? 'bg-blue-500/20 text-blue-400' : ''
                          }`}
                        >
                          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-sm">
                              {client.firstName?.[0] || '?'}{client.lastName?.[0] || ''}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {client.firstName} {client.lastName}
                            </div>
                            <div className="text-sm opacity-50 truncate">
                              {client.phone}
                            </div>
                          </div>
                          {form.clientId === client.id && (
                            <Check size={18} className="text-blue-400 flex-shrink-0" />
                          )}
                        </button>
                      ))
                    )}
                    {clientSearchQuery.trim() && getFilteredClients().length >= 20 && (
                      <div className="px-4 py-2 text-xs text-gray-500 border-t border-white/10">
                        Refine search for more results
                      </div>
                    )}
                  </div>
                )}

                {/* Selected client indicator */}
                {form.clientId && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-green-400">
                    <Check size={14} />
                    <span>Client selected</span>
                  </div>
                )}
              </div>

              <select value={form.trichologistId} onChange={e => setForm({...form, trichologistId: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none">
                <option value="">Select Trichologist</option>
                {trichologists.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-4">
                <PersianCalendar
                  value={form.date}
                  onChange={(date) => setForm({...form, date: date})}
                  isRtl={isRtl}
                />
                <input type="time" value={form.time} onChange={e => setForm({...form, time: e.target.value})} required className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none" />
              </div>
              <textarea placeholder="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={3} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none resize-none" />
              <button type="submit" className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 hover:opacity-90 transition font-semibold">
                {editingSession ? 'Save Changes' : 'Create Session'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

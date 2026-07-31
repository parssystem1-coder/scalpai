import { useEffect, useRef, useState } from 'react';
import { Plus, Search, Edit2, Trash2, X, User, Loader, ChevronRight, ChevronLeft } from 'lucide-react';
import { useClientsStore } from '../store';
import PersianCalendar from '../components/PersianCalendar';
import { formatDateForDisplay } from '../lib/jalaliDate';
import type { Client } from '../db';

export default function Clients() {
  const { managedClients: clients, managedLoading: loading, managedTotal: total, managedPage: page, managedPageSize: pageSize, managedSearch: search, fetchManagedClients, setManagedSearch, goToManagedPage, addClient, updateClient, deleteClient } = useClientsStore();
  const isRtl = false;

  const [searchInput, setSearchInput] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState<{
    firstName: string; lastName: string; phone: string; email: string; gender: 'male' | 'female'; birthDate: string; notes: string;
  }>({
    firstName: '', lastName: '', phone: '', email: '', gender: 'male', birthDate: '', notes: ''
  });

  // ارجاع اکشن zustand پایدار است، پس افزودنش حلقه نمی‌سازد
  useEffect(() => { fetchManagedClients(1); }, [fetchManagedClients]);

  // جستجو با تاخیر کوتاه (debounce) به دیتابیس ارسال می‌شود، نه فقط روی همان صفحهٔ
  // بارگذاری‌شده فیلتر شود — وگرنه مشتری‌های صفحات بعدی هیچ‌وقت در نتیجهٔ جستجو دیده نمی‌شدند.
  // `search` عمداً در آرایهٔ وابستگی نیست: مقدارِ درون‌استور با هر بار تایپ
  // عوض می‌شود و اگر وابستگی می‌شد، تایمر مدام ری‌ست و debounce بی‌اثر می‌شد.
  // راه درست، خواندن آخرین مقدار از ref در لحظهٔ اجرای تایمر است — این هم
  // هشدار لینت را ریشه‌ای می‌بندد و هم رفتار debounce را دست‌نخورده نگه می‌دارد.
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchRef.current) setManagedSearch(searchInput);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, setManagedSearch]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const openModal = (client?: Client) => {
    if (client) {
      setEditingClient(client);
      setForm({ firstName: client.firstName, lastName: client.lastName, phone: client.phone, email: client.email, gender: client.gender, birthDate: client.birthDate, notes: client.notes });
    } else {
      setEditingClient(null);
      setForm({ firstName: '', lastName: '', phone: '', email: '', gender: 'male', birthDate: '', notes: '' });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingClient) {
        await updateClient(editingClient.id, form);
      } else {
        await addClient(form);
      }
      setShowModal(false);
    } catch {
      // خطا از قبل به‌صورت toast به کاربر نشان داده شده؛ مودال را باز نگه می‌داریم
      // تا کاربر بتواند دوباره تلاش کند.
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure?')) {
      await deleteClient(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 start-4 opacity-50" size={20} />
          <input
            type="text"
            placeholder="Search clients..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-full ps-12 pe-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none transition"
          />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm opacity-50">
            {total} clients
          </span>
          <button onClick={() => openModal()} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 hover:opacity-90 transition">
            <Plus size={20} />
            <span>New Client</span>
          </button>
        </div>
      </div>

      {/* Clients Grid */}
      {loading && clients.length === 0 ? (
        <div className="text-center py-12 opacity-50">
          <Loader className="animate-spin mx-auto mb-4" size={32} />
          <p>Loading...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12 opacity-50">
          <User size={48} className="mx-auto mb-4 opacity-30" />
          <p>No clients found</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map(client => (
              <div key={client.id} className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 hover:border-blue-500/50 transition group">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                      <span className="text-white font-bold text-lg">{client.firstName?.[0] || '?'}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold">{client.firstName} {client.lastName}</h3>
                      <p className="text-sm opacity-50">{client.phone}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => openModal(client)} className="p-2 rounded-lg hover:bg-white/10">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(client.id)} className="p-2 rounded-lg hover:bg-red-500/20 text-red-400">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="space-y-2 text-sm opacity-70">
                  {client.email && <p>{client.email}</p>}
                  <p>{client.gender === 'male' ? 'Male' : 'Female'}</p>
                  {client.birthDate && <p>{formatDateForDisplay(client.birthDate)}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-6 flex-wrap">
              <button
                onClick={() => goToManagedPage(page - 1)}
                disabled={page <= 1 || loading}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                aria-label="Previous page"
              >
                {isRtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === 'ellipsis' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 opacity-40">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goToManagedPage(p)}
                      disabled={loading}
                      className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm transition ${p === page ? 'bg-blue-500 text-white' : 'bg-white/5 hover:bg-white/10'}`}
                    >
                      {p}
                    </button>
                  )
                )}

              <button
                onClick={() => goToManagedPage(page + 1)}
                disabled={page >= totalPages || loading}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                aria-label="Next page"
              >
                {isRtl ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
              </button>

              {loading && <Loader className="animate-spin ms-2" size={18} />}
            </div>
          )}

          <div className="text-center text-sm opacity-50">
            {`Page ${page} of ${totalPages} — showing ${clients.length} of ${total} clients`}
          </div>
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-gray-800 border border-white/10 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">{editingClient ? 'Edit Client' : 'New Client'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-white/10">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="First Name" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} required className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none" />
                <input type="text" placeholder="Last Name" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} required className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none" />
              </div>
              <input type="tel" placeholder="Phone" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} required className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none" />
              <input type="email" placeholder="Email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none" />
              <div className="grid grid-cols-2 gap-4">
                <select value={form.gender} onChange={e => setForm({...form, gender: e.target.value as 'male' | 'female'})} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
                <PersianCalendar
                  value={form.birthDate}
                  onChange={(date) => setForm({...form, birthDate: date})}
                  isRtl={isRtl}
                  variant="birth"
                />
              </div>
              <textarea placeholder="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={3} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none resize-none" />
              <button type="submit" className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 hover:opacity-90 transition font-semibold">
                {editingClient ? 'Save Changes' : 'Add Client'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

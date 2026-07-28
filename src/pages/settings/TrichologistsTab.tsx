import { useState } from 'react';
import { Users, Plus, Edit2, Trash2, X } from 'lucide-react';
import { useTrichologistsStore } from '../../store';
import type { Trichologist } from '../../db';
import { useT } from '../../i18n';
import { settingsDict } from './strings';

const EMPTY_FORM = { name: '', specialty: '', phone: '', email: '', description: '', active: true };

export default function TrichologistsTab() {
  const { trichologists, addTrichologist, updateTrichologist, deleteTrichologist } = useTrichologistsStore();
  const t = useT(settingsDict);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Trichologist | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const openModal = (tri?: Trichologist) => {
    if (tri) {
      setEditing(tri);
      setForm({ name: tri.name, specialty: tri.specialty, phone: tri.phone, email: tri.email, description: tri.description, active: tri.active });
    } else {
      setEditing(null);
      setForm(EMPTY_FORM);
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await updateTrichologist(editing.id, form);
    } else {
      await addTrichologist(form);
    }
    setShowModal(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">{t('manageTrichologists')}</h3>
        <button onClick={() => openModal()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 hover:opacity-90 transition">
          <Plus size={20} />
          <span>{t('add')}</span>
        </button>
      </div>

      {trichologists.length === 0 ? (
        <div className="text-center py-12 opacity-50">
          <Users size={48} className="mx-auto mb-4 opacity-30" />
          <p>{t('noTrichologists')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {trichologists.map(tri => (
            <div key={tri.id} className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                  <span className="text-white font-bold">{tri.name[0]}</span>
                </div>
                <div>
                  <h4 className="font-semibold">{tri.name}</h4>
                  <p className="text-sm opacity-50">{tri.specialty}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 rounded-full text-xs ${tri.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                  {tri.active ? t('active') : t('inactive')}
                </span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => openModal(tri)} className="p-2 rounded-lg hover:bg-white/10">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => deleteTrichologist(tri.id)} className="p-2 rounded-lg hover:bg-red-500/20 text-red-400">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-gray-800 border border-white/10 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">{editing ? t('editTrichologist') : t('newTrichologist')}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-white/10"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="text" placeholder={t('name')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none" />
              <input type="text" placeholder={t('specialty')} value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none" />
              <div className="grid grid-cols-2 gap-4">
                <input type="tel" placeholder={t('phone')} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none" />
                <input type="email" placeholder={t('email')} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none" />
              </div>
              <textarea placeholder={t('description')} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none resize-none" />
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="w-5 h-5 rounded" />
                <span>{t('active')}</span>
              </label>
              <button type="submit" className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 hover:opacity-90 transition font-semibold">
                {editing ? t('saveChanges') : t('add')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

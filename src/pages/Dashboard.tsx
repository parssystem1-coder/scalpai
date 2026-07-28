import { useEffect, useMemo } from 'react';
import { Users, Calendar, Image, Activity, TrendingUp, Clock } from 'lucide-react';
import { useClientsStore, useSessionsStore, useGalleryStore } from '../store';

/** تاریخ محلی به صورت yyyy-MM-dd — هم‌فرمت با تاریخ جلسات (نه UTC) */
function toLocalDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** تاریخ مؤثر جلسه؛ اگر date خالی باشد از createdAt استفاده می‌شود */
function sessionDate(session: { date?: string; createdAt?: string }): string {
  const raw = (session.date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (session.createdAt) return toLocalDateString(new Date(session.createdAt));
  return '';
}

export default function Dashboard() {
  const { clients, fetchClients } = useClientsStore();
  const { sessions, fetchSessions } = useSessionsStore();
  const { total, fetchAll } = useGalleryStore();

  useEffect(() => {
    fetchClients();
    fetchSessions();
    fetchAll();
  }, [fetchClients, fetchSessions, fetchAll]);

  const today = toLocalDateString();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  const yearPrefix = `${currentYear}`;

  const {
    upcomingSessions,
    completedSessions,
    todaySessions,
    monthSessions,
    yearSessions,
    clientsThisMonth,
    recentClients,
  } = useMemo(() => {
    const withDates = sessions.map(s => ({ s, date: sessionDate(s) }));

    const upcoming = withDates.filter(
      ({ s, date }) => s.status === 'scheduled' && (!date || date >= today),
    ).length;
    const completed = sessions.filter(s => s.status === 'completed').length;
    const todayCount = withDates.filter(({ date }) => date === today).length;
    const monthCount = withDates.filter(({ date }) => date.startsWith(monthPrefix)).length;
    const yearCount = withDates.filter(({ date }) => date.startsWith(yearPrefix)).length;

    const monthClients = clients.filter(c => {
      if (!c.createdAt) return false;
      const created = new Date(c.createdAt);
      return created.getFullYear() === currentYear && created.getMonth() === currentMonth;
    }).length;

    return {
      upcomingSessions: upcoming,
      completedSessions: completed,
      todaySessions: todayCount,
      monthSessions: monthCount,
      yearSessions: yearCount,
      clientsThisMonth: monthClients,
      recentClients: clients.slice(0, 5),
    };
  }, [sessions, clients, today, currentYear, currentMonth, monthPrefix, yearPrefix]);

  // برچسب‌های داشبورد همیشه انگلیسی‌اند (مستقل از زبان UI)
  const stats = [
    { icon: Users, label: 'Total Clients', value: clients.length, color: 'from-blue-500 to-cyan-500' },
    { icon: Calendar, label: 'Upcoming Sessions', value: upcomingSessions, color: 'from-purple-500 to-pink-500' },
    { icon: Image, label: 'Gallery Items', value: total, color: 'from-orange-500 to-red-500' },
    { icon: Activity, label: 'Completed Sessions', value: completedSessions, color: 'from-green-500 to-emerald-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="relative overflow-hidden rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 group hover:scale-105 transition-transform">
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-10 group-hover:opacity-20 transition`} />
              <div className="relative">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-4`}>
                  <Icon className="text-white" size={24} />
                </div>
                <p className="text-3xl font-bold">{stat.value}</p>
                <p className="text-sm opacity-70 mt-1">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions & Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Clients */}
        <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-6">
            <Users size={24} className="text-blue-400" />
            <h3 className="text-lg font-semibold">Recent Clients</h3>
          </div>
          {recentClients.length === 0 ? (
            <p className="text-center opacity-50 py-8">No clients yet</p>
          ) : (
            <div className="space-y-3">
              {recentClients.map(client => (
                <div key={client.id} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                    <span className="text-white font-bold">{client.firstName?.[0] || '?'}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{client.firstName} {client.lastName}</p>
                    <p className="text-sm opacity-50">{client.phone}</p>
                  </div>
                  <Clock size={16} className="opacity-50" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp size={24} className="text-green-400" />
            <h3 className="text-lg font-semibold">Quick Stats</h3>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 rounded-xl bg-white/5">
              <span>Clients This Month</span>
              <span className="text-2xl font-bold text-blue-400">{clientsThisMonth}</span>
            </div>
            <div className="flex justify-between items-center p-4 rounded-xl bg-white/5">
              <span>Today&apos;s Sessions</span>
              <span className="text-2xl font-bold text-purple-400">{todaySessions}</span>
            </div>
            <div className="flex justify-between items-center p-4 rounded-xl bg-white/5">
              <span>Sessions This Month</span>
              <span className="text-2xl font-bold text-cyan-400">{monthSessions}</span>
            </div>
            <div className="flex justify-between items-center p-4 rounded-xl bg-white/5">
              <span>Sessions This Year</span>
              <span className="text-2xl font-bold text-emerald-400">{yearSessions}</span>
            </div>
            <div className="flex justify-between items-center p-4 rounded-xl bg-white/5">
              <span>Gallery Images</span>
              <span className="text-2xl font-bold text-orange-400">{total}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

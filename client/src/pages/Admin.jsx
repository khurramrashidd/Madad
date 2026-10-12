import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Users, ClipboardList, Scale, Search,
  TrendingUp, TrendingDown, Ban, Check, AlertTriangle,
} from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import Avatar from '../components/Avatar.jsx';
import TrustBadge from '../components/TrustBadge.jsx';
import Spinner from '../components/Spinner.jsx';
import Sheet from '../components/Sheet.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { STATUS_META } from '../utils/constants.js';

/**
 * Admin dashboard.
 *
 * Because there is no escrow, disputes are resolved socially — so an admin
 * needs the evidence. That is exactly why chat is soft-deleted for 7 days
 * rather than destroyed at settlement.
 */
export default function Admin() {
  const [tab, setTab] = useState('overview');
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full bg-ink-50">
      <header className="shrink-0 bg-surface border-b border-ink-100 safe-top px-4 pb-0">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-display font-bold text-lg">Admin</h1>
        </div>

        <div className="flex gap-5 overflow-x-auto no-scrollbar">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'users', label: 'Users' },
            { key: 'tasks', label: 'Tasks' },
            { key: 'disputes', label: 'Disputes' },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
                    className={`pb-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors
                                ${tab === t.key ? 'border-brand-500 text-ink-900' : 'border-transparent text-ink-400'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && <Overview />}
        {tab === 'users' && <UsersTab />}
        {tab === 'tasks' && <TasksTab />}
        {tab === 'disputes' && <DisputesTab />}
      </div>
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.admin.stats().then((r) => setStats(r.stats)).catch(() => {});
  }, []);

  if (!stats) return <div className="grid place-items-center py-16"><Spinner size={24} className="text-brand-500" /></div>;

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Users" value={stats.users.total} sub={`${stats.users.restricted} restricted`} icon={Users} />
        <Tile label="Tasks" value={stats.tasks.total} sub={`${stats.tasks.open} open now`} icon={ClipboardList} />
        <Tile label="Settle rate" value={`${stats.tasks.settleRate}%`} sub={`${stats.tasks.settled} settled`} />
        <Tile label="Open disputes" value={stats.disputes.open} sub={`${stats.tasks.disputed} tasks flagged`} icon={Scale} />
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Bounty volume</p>
        <p className="font-display font-bold text-3xl tabular-nums mt-1">₹{stats.bounty.totalSettled.toLocaleString('en-IN')}</p>
        <p className="text-sm text-ink-500 mt-1">
          settled peer-to-peer · average ₹{stats.bounty.average} · platform commission ₹0
        </p>
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-1">Average trust score</p>
        <p className="font-display font-bold text-3xl tabular-nums">{stats.trust.average}<span className="text-base text-ink-400">/100</span></p>
      </div>

      {stats.byCategory?.length > 0 && (
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-3">By category</p>
          <div className="space-y-2.5">
            {stats.byCategory.map((c) => {
              const max = stats.byCategory[0].count || 1;
              return (
                <div key={c._id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize text-ink-600">{String(c._id).replace('_', ' ')}</span>
                    <span className="font-semibold tabular-nums">{c.count}</span>
                  </div>
                  <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(c.count / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, icon: Icon }) {
  return (
    <div className="card p-4">
      {Icon && <Icon size={17} className="text-ink-400 mb-2" />}
      <p className="font-display font-bold text-2xl tabular-nums">{value}</p>
      <p className="text-xs font-medium text-ink-600">{label}</p>
      {sub && <p className="text-[11px] text-ink-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [delta, setDelta] = useState(5);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    setLoading(true);
    api.admin.users({ q, filter })
      .then((r) => setUsers(r.users || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q, filter]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const adjust = async () => {
    setBusy(true);
    try {
      await api.admin.adjustTrust(selected.id, Number(delta), 'Manual adjustment from the admin dashboard');
      toast.success('Trust score adjusted');
      setSelected(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleRestrict = async (u) => {
    try {
      const res = await api.admin.toggleRestrict(u.id, 'Reviewed by an administrator');
      toast.success(res.isRestricted ? 'User restricted' : 'Restriction lifted');
      setSelected(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="relative">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or phone"
               className="w-full h-10 pl-9 pr-3 rounded-xl bg-surface border border-ink-200 text-sm outline-none focus:border-brand-500" />
      </div>

      <div className="flex gap-2">
        {[
          { v: 'all', l: 'All' },
          { v: 'restricted', l: 'Restricted' },
          { v: 'lowtrust', l: 'Low trust' },
        ].map((f) => (
          <button key={f.v} onClick={() => setFilter(f.v)}
                  className={`chip px-3 py-1.5 ${filter === f.v ? 'bg-ink-900 text-ink-50' : 'bg-ink-100 text-ink-600'}`}>
            {f.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-12"><Spinner size={22} className="text-brand-500" /></div>
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="No users match" />
      ) : (
        users.map((u) => (
          <button key={u.id} onClick={() => setSelected(u)} className="card p-3.5 w-full flex items-center gap-3 text-left">
            <Avatar name={u.name} color={u.avatarColor} src={u.avatar} size={40} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">{u.name}</p>
              <p className="text-xs text-ink-500 truncate">{u.email}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <TrustBadge score={u.trustScore} badge={u.badge} />
                {u.flakeCount > 0 && <span className="chip bg-danger/10 text-danger">{u.flakeCount} flakes</span>}
                {u.nonPaymentCount > 0 && <span className="chip bg-danger/10 text-danger">{u.nonPaymentCount} unpaid</span>}
              </div>
            </div>
          </button>
        ))
      )}

      <Sheet open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.name}>
        {selected && (
          <div className="space-y-4 pb-4">
            <div className="flex items-center gap-3">
              <Avatar name={selected.name} color={selected.avatarColor} src={selected.avatar} size={52} />
              <div className="min-w-0">
                <p className="font-semibold">{selected.name}</p>
                <p className="text-sm text-ink-500 truncate">{selected.email}</p>
                {selected.phone && <p className="text-sm text-ink-500">+91 {selected.phone}</p>}
                {selected.upiId && <p className="text-xs text-ink-400 font-mono truncate">{selected.upiId}</p>}
              </div>
            </div>

            {selected.restrictedReason && (
              <div className="p-3 rounded-xl bg-danger/10 text-danger text-sm">
                {selected.restrictedReason.replace('admin: ', '')}
              </div>
            )}

            <div>
              <p className="label">Adjust trust score (currently {selected.trustScore})</p>
              <div className="grid grid-cols-4 gap-2">
                {[-20, -10, 5, 10].map((d) => (
                  <button key={d} onClick={() => setDelta(d)}
                          className={`h-11 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-1
                                      ${delta === d ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}>
                    {d > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>
              <button onClick={adjust} disabled={busy} className="btn-dark btn-md w-full mt-3">
                {busy ? <Spinner size={16} /> : `Apply ${delta > 0 ? '+' : ''}${delta}`}
              </button>
            </div>

            <button onClick={() => toggleRestrict(selected)}
                    className={`btn-md w-full ${selected.isRestricted ? 'btn-primary' : 'btn-danger'}`}>
              {selected.isRestricted ? <><Check size={16} /> Lift restriction</> : <><Ban size={16} /> Restrict account</>}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function TasksTab() {
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.admin.tasks(status === 'all' ? '' : status)
      .then((r) => setTasks(r.tasks || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {['all', 'open', 'claimed', 'delivered', 'settled', 'disputed'].map((s) => (
          <button key={s} onClick={() => setStatus(s)}
                  className={`chip px-3 py-1.5 capitalize shrink-0 ${status === s ? 'bg-ink-900 text-ink-50' : 'bg-ink-100 text-ink-600'}`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-12"><Spinner size={22} className="text-brand-500" /></div>
      ) : tasks.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No tasks match" />
      ) : (
        tasks.map((t) => {
          const meta = STATUS_META[t.status];
          return (
            <div key={t._id} className="card p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-sm leading-snug">{t.title}</p>
                <span className="font-display font-bold text-brand-600 shrink-0">₹{t.bounty}</span>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-ink-500">
                {meta && <span className={`chip ${meta.tone}`}>{meta.label}</span>}
                <span className="truncate">{t.wisher?.name}</span>
                {t.volunteer && <span className="truncate">→ {t.volunteer.name}</span>}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function DisputesTab() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    api.admin.disputes().then((r) => setDisputes(r.disputes || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const open = async (d) => {
    setSelected(d);
    setEvidence(null);
    setNote('');
    try {
      setEvidence(await api.admin.evidence(d._id));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const resolve = async (verdict) => {
    setBusy(true);
    try {
      await api.admin.resolve(selected._id, verdict, note);
      toast.success('Dispute resolved');
      setSelected(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      {loading ? (
        <div className="grid place-items-center py-12"><Spinner size={22} className="text-brand-500" /></div>
      ) : disputes.length === 0 ? (
        <EmptyState icon={Scale} title="No disputes" message="Nothing needs arbitration right now." />
      ) : (
        disputes.map((d) => (
          <button key={d._id} onClick={() => open(d)} className="card p-4 w-full text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{d.task?.title || 'Task removed'}</p>
                <p className="text-xs text-ink-500 mt-0.5 capitalize">{d.reason.replace('_', ' ')}</p>
              </div>
              <span className={`chip shrink-0 ${d.status === 'resolved' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                {d.status}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-ink-100 text-xs">
              <Avatar name={d.raisedBy?.name} color={d.raisedBy?.avatarColor} size={22} />
              <span className="font-medium truncate">{d.raisedBy?.name}</span>
              <span className="text-ink-400">vs</span>
              <Avatar name={d.against?.name} color={d.against?.avatarColor} size={22} />
              <span className="font-medium truncate">{d.against?.name}</span>
            </div>
          </button>
        ))
      )}

      <Sheet open={Boolean(selected)} onClose={() => setSelected(null)} title="Resolve dispute">
        {selected && (
          <div className="space-y-4 pb-4">
            <div className="p-3 rounded-xl bg-ink-100">
              <p className="text-sm font-semibold capitalize">{selected.reason.replace('_', ' ')}</p>
              {selected.detail && <p className="text-sm text-ink-600 mt-1 leading-relaxed">{selected.detail}</p>}
            </div>

            <div>
              <p className="label flex items-center gap-1.5">
                <AlertTriangle size={14} /> Chat evidence
              </p>
              <p className="text-xs text-ink-500 mb-2">
                Retained for 7 days after settlement, then deleted automatically.
              </p>
              <div className="max-h-52 overflow-y-auto space-y-1.5 p-3 rounded-xl bg-ink-50">
                {!evidence ? (
                  <div className="grid place-items-center py-6"><Spinner size={18} className="text-brand-500" /></div>
                ) : evidence.messages?.length === 0 ? (
                  <p className="text-sm text-ink-400 text-center py-4">No messages</p>
                ) : (
                  evidence.messages.map((m) => (
                    <div key={m._id} className="text-sm">
                      <span className="font-semibold text-ink-700">{m.sender?.name}: </span>
                      <span className="text-ink-600">{m.body}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                      className="textarea" placeholder="Resolution note (shown to both parties)" maxLength={600} />

            {selected.status !== 'resolved' && (
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => resolve('upheld')} disabled={busy} className="btn-danger btn-md text-xs">
                  Uphold
                </button>
                <button onClick={() => resolve('split')} disabled={busy} className="btn-ghost btn-md text-xs">
                  Split
                </button>
                <button onClick={() => resolve('dismissed')} disabled={busy} className="btn-outline btn-md text-xs">
                  Dismiss
                </button>
              </div>
            )}
            <p className="text-xs text-ink-500 leading-relaxed">
              Upholding penalises the accused and credits the reporter. Dismissing
              costs the reporter trust points — that is what stops frivolous reports.
            </p>
          </div>
        )}
      </Sheet>
    </div>
  );
}

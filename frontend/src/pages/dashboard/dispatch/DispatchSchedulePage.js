import { useEffect, useState, useCallback } from 'react';
import { api, formatApiErrorDetail } from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/sonner';
import { Plus, Filter, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, MoreVertical, Columns as ColumnsIcon, Download, GripVertical, Eye, EyeOff } from 'lucide-react';
import useAuthStore from '@/stores/authStore';
import { hasPermission } from '@/lib/permissions';
import { CONFIRM_BADGE } from './_shared';

const SHIFT_TYPES = ['Morning', 'Afternoon', 'Evening', 'Night'];
const CONF_STATUSES = ['Not Confirmed', 'Pending', 'Confirmed', 'Declined', 'No Response'];
const CONF_METHODS = ['Call', 'Text', 'Call + Text'];
const SHIFT_STATUSES = ['Not Started', 'Clocked In', 'Clocked Out', 'Late Clocked In', 'Early Clocked Out', 'Late Clocked Out', 'Complete', 'Cancelled'];
const QUICK_ACTIONS = ['Clocked In', 'Clocked Out', 'Late Clocked In', 'Late Clocked Out'];
const STATUS_BADGE_MAP = {
  'Not Started':       'bg-slate-700 text-slate-50 border-slate-800 dark:bg-slate-600 dark:text-slate-50 dark:border-slate-500',
  'Clocked In':        'bg-emerald-700 text-emerald-50 border-emerald-800 dark:bg-emerald-600 dark:text-emerald-50 dark:border-emerald-500',
  'Clocked Out':       'bg-sky-700 text-sky-50 border-sky-800 dark:bg-sky-600 dark:text-sky-50 dark:border-sky-500',
  'Late Clocked In':   'bg-amber-700 text-amber-50 border-amber-800 dark:bg-amber-600 dark:text-amber-50 dark:border-amber-500',
  'Late Clocked Out':  'bg-orange-700 text-orange-50 border-orange-800 dark:bg-orange-600 dark:text-orange-50 dark:border-orange-500',
  'Early Clocked Out': 'bg-fuchsia-700 text-fuchsia-50 border-fuchsia-800 dark:bg-fuchsia-600 dark:text-fuchsia-50 dark:border-fuchsia-500',
  'Absent':            'bg-rose-700 text-rose-50 border-rose-800 dark:bg-rose-600 dark:text-rose-50 dark:border-rose-500',
  'Complete':          'bg-indigo-700 text-indigo-50 border-indigo-800 dark:bg-indigo-600 dark:text-indigo-50 dark:border-indigo-500',
  'Cancelled':         'bg-zinc-800 text-zinc-100 border-zinc-900 line-through dark:bg-zinc-700 dark:text-zinc-100 dark:border-zinc-600',
};

// Row background tint by shift type — subtle so status badges stay readable.
const SHIFT_ROW_BG = {
  Morning:   'bg-amber-50 dark:bg-amber-950/20',
  Afternoon: 'bg-sky-50 dark:bg-sky-950/20',
  Evening:   'bg-orange-50 dark:bg-orange-950/25',
  Night:     'bg-indigo-50 dark:bg-indigo-950/25',
};
const DEFAULT_ROW_BG = 'bg-white dark:bg-[#18181B]';

const emptyFilters = {
  officer_id: '', vendor_id: '', client_id: '', post_site_id: '', post_pin: '', work_order: '',
  date_from: '', date_to: '', shift_type: '', confirmation_status: '', shift_status: '',
};

// Format "2026-07-25" -> "Sat, 25 Jul 2026". Parses YYYY-MM-DD as a local date
// (avoids UTC-shifted day names from `new Date('2026-07-25')`).
const formatScheduleDate = (iso) => {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = String(d.getDate()).padStart(2, '0');
  return `${days[d.getDay()]}, ${dd} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

// Column catalogue. Each entry: { key, label, financial?, align?, csv(row), value(row) }
// `value` returns a plain string used both as fallback UI text and CSV cell.
// Interactive cells (status/confirmation/confirmed-by/manage) are rendered separately.
const COLUMN_CATALOG = [
  { key: 'date',        label: 'Date',                 csv: (r) => formatScheduleDate(r.date) },
  { key: 'shift',       label: 'Shift',                csv: (r) => r.shift_type || '' },
  { key: 'start_time',  label: 'Start Time',           csv: (r) => r.start_time || '' },
  { key: 'end_time',    label: 'End Time',             csv: (r) => r.end_time || '' },
  { key: 'duty_hours',  label: 'Duty Hours',           csv: (r) => r.duty_hours != null ? String(r.duty_hours) : '' },
  { key: 'duty_rate',   label: 'Duty Rate ($)',        financial: true, csv: (r) => r.duty_rate != null ? String(r.duty_rate) : '' },
  { key: 'billing_rate',label: 'Billing Rate ($)',     financial: true, csv: (r) => r.billing_rate != null ? String(r.billing_rate) : '' },
  { key: 'site',        label: 'Site',                 csv: (r) => r.post_site_name || '' },
  { key: 'city',        label: 'City',                 csv: (r) => r.city || '' },
  { key: 'post_pin',    label: 'Post Site Pin',        csv: (r) => r.post_pin || '' },
  { key: 'officer',     label: 'Security Officer',     csv: (r) => r.officer_name || '' },
  { key: 'shift_status',label: 'Shift Status',         csv: (r) => r.shift_status || '' },
  { key: 'confirmation',label: 'Upcoming Shift Status',csv: (r) => r.confirmation_status || '' },
  { key: 'confirmed_by',label: 'Confirmed By',         csv: (r) => [r.last_modified_by_name, r.last_modified_action, (r.last_modified_at || '').slice(0, 16).replace('T', ' ')].filter(Boolean).join(' · ') },
  { key: 'remarks',     label: 'Remarks',              csv: (r) => r.last_modified_remarks || r.remarks || '' },
  { key: 'client',      label: 'Client',               csv: (r) => r.client_name || '' },
  { key: 'vendor',      label: 'Vendor',               csv: (r) => r.vendor_name || '' },
];

// Convert a matrix of values into a CSV string (RFC 4180-compatible quoting).
const buildCsv = (headers, rows) => {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(','), ...rows.map((row) => row.map(esc).join(','))].join('\r\n');
};

const downloadFile = (filename, mime, content) => {
  const blob = new Blob(['\uFEFF' + content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
};

const DispatchSchedulePage = ({ todayOnly = false }) => {
  const { user } = useAuthStore();
  const canCreate = hasPermission(user, 'dispatch.schedule.create');
  const canEdit = hasPermission(user, 'dispatch.schedule.edit');
  const canDelete = hasPermission(user, 'dispatch.schedule.delete');
  const canCancel = hasPermission(user, 'dispatch.schedule.cancel');
  const canConfirm = hasPermission(user, 'dispatch.confirmation.manage');
  const canFinancial = hasPermission(user, 'dispatch.financial.view');

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(
    todayOnly ? { ...emptyFilters, date_from: new Date().toISOString().slice(0, 10), date_to: new Date().toISOString().slice(0, 10) } : emptyFilters
  );

  const [clients, setClients] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [postSites, setPostSites] = useState([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const [confDialog, setConfDialog] = useState(null);
  const [confForm, setConfForm] = useState({ confirmation_status: 'Confirmed', confirmation_method: 'Call', remarks: '' });
  const [actionsDialog, setActionsDialog] = useState(null);
  const [actions, setActions] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [statusBusy, setStatusBusy] = useState(null);
  const [statusDialog, setStatusDialog] = useState(null); // { row, status }
  const [statusRemarks, setStatusRemarks] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ---- Column chooser: per-user visibility + order, persisted in localStorage ----
  const availableCols = COLUMN_CATALOG.filter((c) => canFinancial || !c.financial);
  const storageKey = `dispatch.schedule.columns.${user?.id || 'anon'}`;
  const defaultConfig = availableCols.map((c) => ({ key: c.key, visible: true }));

  const [columnConfig, setColumnConfig] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const known = new Set(availableCols.map((c) => c.key));
        // keep only known keys in stored order, then append any new keys
        const cleaned = parsed.filter((c) => known.has(c.key));
        availableCols.forEach((c) => {
          if (!cleaned.find((x) => x.key === c.key)) cleaned.push({ key: c.key, visible: true });
        });
        return cleaned;
      }
    } catch { /* ignore */ }
    return defaultConfig;
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(columnConfig)); } catch { /* ignore */ }
  }, [columnConfig, storageKey]);

  const [chooserOpen, setChooserOpen] = useState(false);
  const [dragKey, setDragKey] = useState(null);

  const visibleCols = columnConfig
    .filter((c) => c.visible)
    .map((c) => availableCols.find((x) => x.key === c.key))
    .filter(Boolean);

  const toggleColumn = (key) =>
    setColumnConfig((prev) => prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  const moveColumn = (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    setColumnConfig((prev) => {
      const arr = prev.slice();
      const fromIdx = arr.findIndex((c) => c.key === fromKey);
      const toIdx = arr.findIndex((c) => c.key === toKey);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return arr;
    });
  };
  const resetColumns = () => setColumnConfig(defaultConfig);

  const exportCsv = () => {
    const headers = visibleCols.map((c) => c.label);
    const body = rows.map((r) => visibleCols.map((c) => c.csv(r)));
    const csv = buildCsv(headers, body);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadFile(`dispatch-schedule-${stamp}.csv`, 'text/csv', csv);
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'} to CSV`);
  };

  // Sticky styling shared by the first / last column's <th>/<td>. Left-0
  // keeps them visible while horizontal-scrolling wide tables. The row
  // background follows the shift tint, so sticky cells must match that
  // tint at render time (see cell rendering below).
  const stickyFirstTh = 'sticky left-0 z-20 bg-[#fbc9ff]';
  const stickyLastTh = 'sticky right-0 z-20 bg-[#fbc9ff]';
  // Excel-like grid: right + bottom border on each cell; container's outer
  // border closes the left and top edges.
  const cellBorder = 'border-r border-b border-[#E2E8F0] dark:border-[#27272A]';

  // Per-column background overrides. Some columns are highlighted regardless
  // of the row's shift tint (Date is the anchor column, Security Officer is
  // called out separately). Returns null when no override applies.
  const columnCellBg = (key) => {
    if (key === 'date') return 'bg-[#fbc9ff]';
    if (key === 'officer') return 'bg-[rgb(232,250,255)] dark:bg-[rgb(232,250,255)]';
    return null;
  };
  // Per-column border colour override. Currently unused — kept for future
  // per-column accents. Returns null so every column shares the default
  // cellBorder colour.
  const columnCellBorder = (_key) => null;
  // Per-column text colour accents (city green, post pin red).
  const columnCellText = (key) => {
    if (key === 'city') return 'text-emerald-600 dark:text-emerald-400 font-semibold';
    if (key === 'post_pin') return 'text-rose-600 dark:text-rose-400 font-semibold';
    if (key === 'date') return 'text-black font-semibold';
    return '';
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = { page, limit };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await api.get('/dispatch/schedules', { params });
      setRows(data.items || []);
      setTotal(data.total || 0);
    } catch (e) { if (!silent) toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { if (!silent) setLoading(false); }
  }, [page, limit, filters]);

  useEffect(() => { load(); }, [load]);
  // Real-time polling — every 10s, silent so no loading flicker
  useEffect(() => {
    const t = setInterval(() => load(true), 10_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    api.get('/dispatch/clients').then(r => setClients(r.data)).catch(() => {});
    api.get('/dispatch/vendors').then(r => setVendors(r.data)).catch(() => {});
    api.get('/dispatch/officers').then(r => setOfficers(r.data)).catch(() => {});
    api.get('/dispatch/post-sites').then(r => setPostSites(r.data)).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditing(null);
    const today = new Date().toISOString().slice(0, 10);
    setForm({ date: today, shift_type: 'Morning', start_time: '08:00', end_time: '16:00' });
    setDialogOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    // Only pick editable fields — do NOT include shift_status, actual_check_in/out or
    // any computed/enriched fields. They should be changed via Quick Actions, not Edit.
    setForm({
      date: row.date, shift_type: row.shift_type,
      start_time: row.start_time, end_time: row.end_time,
      client_id: row.client_id, vendor_id: row.vendor_id,
      post_site_id: row.post_site_id, officer_id: row.officer_id,
      duty_rate: row.duty_rate ?? null,
      billing_rate: row.billing_rate ?? null,
      work_order_number: row.work_order_number ?? null,
      remarks: row.remarks ?? '',
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    // client-side required check
    for (const k of ['date', 'shift_type', 'start_time', 'end_time', 'client_id', 'vendor_id', 'post_site_id', 'officer_id']) {
      if (!form[k]) { toast.error(`${k.replace('_', ' ')} is required`); return; }
    }
    try {
      if (editing) {
        // Send only actually-changed fields so audit stays clean
        const changed = {};
        Object.entries(form).forEach(([k, v]) => {
          const oldV = editing[k];
          const same = (oldV ?? null) === (v ?? null) || (oldV === '' && !v) || (v === '' && !oldV);
          if (!same) changed[k] = v === '' ? null : v;
        });
        if (Object.keys(changed).length === 0) {
          toast.info('No changes to save'); setDialogOpen(false); return;
        }
        await api.put(`/dispatch/schedules/${editing.id}`, changed);
      } else {
        await api.post('/dispatch/schedules', form);
      }
      toast.success(`Schedule ${editing ? 'updated' : 'created'}`);
      setDialogOpen(false); load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const cancelSchedule = async (row) => {
    if (!window.confirm(`Cancel schedule for ${row.officer_name}?`)) return;
    try { await api.post(`/dispatch/schedules/${row.id}/cancel`); toast.success('Cancelled'); load(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };
  const deleteSchedule = async (row) => {
    if (!window.confirm('Delete permanently?')) return;
    try { await api.delete(`/dispatch/schedules/${row.id}`); toast.success('Deleted'); load(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const openConfirm = (row, preselectStatus = null) => {
    setConfDialog(row);
    setConfForm({
      confirmation_status: preselectStatus || row.confirmation_status || 'Confirmed',
      confirmation_method: 'Call',
      remarks: ''
    });
  };
  const submitConfirm = async () => {
    try {
      await api.post(`/dispatch/schedules/${confDialog.id}/confirm`, confForm);
      toast.success('Confirmation updated'); setConfDialog(null); load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };
  const openActions = async (row) => {
    setActions([]);              // clear stale entries before showing loader
    setActionsLoading(true);
    setActionsDialog(row);
    try { const { data } = await api.get(`/dispatch/schedules/${row.id}/actions`); setActions(data); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setActionsLoading(false); }
  };
  const openStatusDialog = (row, status) => {
    if (status === row.shift_status) return;
    setStatusDialog({ row, status });
    setStatusRemarks('');
  };
  const applyStatus = async () => {
    if (!statusDialog) return;
    const { row, status } = statusDialog;
    setStatusBusy(`${row.id}:${status}`);
    try {
      const payload = { shift_status: status, remarks: statusRemarks || null };
      const now = new Date().toTimeString().slice(0, 5);
      if (status === 'Clocked In' || status === 'Late Clocked In') payload.actual_check_in = now;
      if (status === 'Clocked Out' || status === 'Late Clocked Out' || status === 'Early Clocked Out') payload.actual_check_out = now;
      await api.post(`/dispatch/schedules/${row.id}/status`, payload);
      toast.success(`${status} recorded by ${user?.name}`);
      setStatusDialog(null); setStatusRemarks('');
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setStatusBusy(null); }
  };

  const setF = (k, v) => { setFilters({ ...filters, [k]: v }); setPage(1); };
  const activeChips = Object.entries(filters).filter(([k, v]) => v).map(([k, v]) => ({ k, v }));
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6" data-testid="dispatch-schedule-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[#0F172A] dark:text-[#FAFAFA]">
            {todayOnly ? "Today's Dispatch" : 'Dispatch Schedule'}
          </h1>
          <p className="text-sm text-[#64748B] mt-1">{total} record{total !== 1 && 's'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFiltersOpen(true)}
            data-testid="open-filters"
            className="h-9"
          >
            <Filter className="w-4 h-4 mr-2" /> Filters
            {activeChips.length > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-[#4F46E5] text-white text-xs font-medium leading-none">
                {activeChips.length}
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setChooserOpen(true)}
            data-testid="open-column-chooser"
            className="h-9"
          >
            <ColumnsIcon className="w-4 h-4 mr-2" /> Columns
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={rows.length === 0}
            data-testid="export-csv-btn"
            className="h-9"
          >
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          {canCreate && (
            <Button onClick={openCreate} className="bg-[#4F46E5] hover:bg-[#4338CA]" data-testid="new-schedule-btn">
              <Plus className="w-4 h-4 mr-2" /> New Schedule
            </Button>
          )}
        </div>
      </div>

      {/* Client / Vendor title banner — shown when the schedule is filtered
          by client or vendor. Logo on top, name below, no surrounding box. */}
      {(() => {
        const activeClient = filters.client_id ? clients.find((c) => c.id === filters.client_id) : null;
        const activeVendor = filters.vendor_id ? vendors.find((v) => v.id === filters.vendor_id) : null;
        if (!activeClient && !activeVendor) return null;
        const Card = ({ entity, testid }) => (
          <div className="flex flex-col items-center gap-3" data-testid={testid}>
            {entity.logo_path ? (
              <img
                src={entity.logo_path}
                alt={entity.name}
                className="w-24 h-24 object-contain"
                data-testid={`${testid}-logo`}
              />
            ) : (
              <div className="w-24 h-24 flex items-center justify-center text-xs text-[#94A3B8]" data-testid={`${testid}-logo-fallback`}>
                No logo
              </div>
            )}
            <div className="text-2xl font-bold text-[#0F172A] dark:text-[#FAFAFA] leading-tight text-center" data-testid={`${testid}-name`}>
              {entity.name}
            </div>
          </div>
        );
        return (
          <div
            className="flex items-start justify-center gap-16 flex-wrap py-2"
            data-testid="filter-title-banner"
          >
            {activeClient && <Card entity={activeClient} testid="banner-client" />}
            {activeVendor && <Card entity={activeVendor} testid="banner-vendor" />}
          </div>
        );
      })()}

      {/* Table */}
      <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] rounded-xl overflow-x-auto">
        <table className="w-full text-sm table-auto border-separate border-spacing-0">
          <thead className="bg-[#fbc9ff] text-left text-xs uppercase tracking-wider text-black font-bold">
            <tr className="whitespace-nowrap">
              {visibleCols.map((c, i) => (
                <th
                  key={c.key}
                  className={`px-3 py-3 font-bold text-black ${cellBorder} ${columnCellBorder(c.key) || ''} ${i === 0 ? stickyFirstTh : ''}`}
                  data-testid={`col-header-${c.key}`}
                >
                  {c.label}
                </th>
              ))}
              <th className={`px-3 py-3 text-right font-bold text-black ${cellBorder} ${stickyLastTh}`}>Manage</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={visibleCols.length + 1} className="px-4 py-8 text-center text-[#64748B]">Loading…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={visibleCols.length + 1} className="px-4 py-8 text-center text-[#64748B]">No dispatch schedules found</td></tr>
            : rows.map(r => {
              const rowBgClass = SHIFT_ROW_BG[r.shift_type] || DEFAULT_ROW_BG;
              // Sticky cells must repaint the row-bg colour or the columns
              // beneath them would bleed through while scrolling.
              const stickyLastTd = `sticky right-0 z-10 ${rowBgClass}`;
              const cellFor = (key) => {
                switch (key) {
                  case 'date':         return <span className="whitespace-nowrap text-[#334155] dark:text-[#E4E4E7]" data-testid={`sched-date-${r.id}`}>{formatScheduleDate(r.date)}</span>;
                  case 'shift':        return <span className="font-medium">{r.shift_type || '—'}</span>;
                  case 'start_time':   return <span className="whitespace-nowrap">{r.start_time || '—'}</span>;
                  case 'end_time':     return <span className="whitespace-nowrap">{r.end_time || '—'}</span>;
                  case 'duty_hours':   return r.duty_hours != null ? `${r.duty_hours}h` : '—';
                  case 'duty_rate':    return r.duty_rate ?? '—';
                  case 'billing_rate': return r.billing_rate ?? '—';
                  case 'site':         return r.post_site_name || '—';
                  case 'city':         return r.city || '—';
                  case 'post_pin':     return <span className="font-mono text-xs">{r.post_pin || '—'}</span>;
                  case 'officer':      return r.officer_name || '—';
                  case 'shift_status':
                    return canEdit && r.shift_status !== 'Cancelled' ? (
                      <Select
                        value={r.shift_status}
                        onValueChange={(v) => openStatusDialog(r, v)}
                        disabled={!!statusBusy && statusBusy.startsWith(`${r.id}:`)}
                      >
                        <SelectTrigger className={`h-8 w-[150px] text-xs font-semibold border ${STATUS_BADGE_MAP[r.shift_status] || 'bg-slate-100 text-slate-600 border-slate-300'}`} data-testid={`status-select-${r.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SHIFT_STATUSES.filter((s) => s !== 'Cancelled').map((s) => (
                            <SelectItem key={s} value={s} data-testid={`status-option-${s.replace(/\s+/g, '-').toLowerCase()}-${r.id}`}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${STATUS_BADGE_MAP[r.shift_status] || 'bg-slate-100 text-slate-600 border-slate-300'}`}>{r.shift_status}</span>
                    );
                  case 'confirmation':
                    return canConfirm && r.shift_status !== 'Cancelled' ? (
                      <Select value={r.confirmation_status} onValueChange={(v) => openConfirm(r, v)}>
                        <SelectTrigger className={`h-8 w-[160px] text-xs font-semibold border ${CONFIRM_BADGE[r.confirmation_status] || 'bg-slate-100 text-slate-600 border-slate-300'}`} data-testid={`confirmation-select-${r.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONF_STATUSES.map((s) => (
                            <SelectItem key={s} value={s} data-testid={`confirmation-option-${s.replace(/\s+/g, '-').toLowerCase()}-${r.id}`}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${CONFIRM_BADGE[r.confirmation_status] || 'bg-slate-100 text-slate-600 border-slate-300'}`}>{r.confirmation_status}</span>
                    );
                  case 'confirmed_by':
                    return r.last_modified_by_name ? (
                      <button
                        type="button"
                        onClick={() => openActions(r)}
                        className="text-left group focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/40 rounded text-xs"
                        data-testid={`last-modified-${r.id}`}
                        title="Click to view full history"
                      >
                        <div className="font-medium text-[#4F46E5] group-hover:underline">{r.last_modified_by_name}</div>
                        <div className="text-[10px] text-[#64748B]">
                          {r.last_modified_action || 'Modified'} · {(r.last_modified_at || '').slice(0, 16).replace('T', ' ')}
                        </div>
                      </button>
                    ) : <span className="text-[#64748B]">—</span>;
                  case 'remarks':
                    return (
                      <span
                        className="line-clamp-2 text-[#334155] dark:text-[#E4E4E7] max-w-[220px] block"
                        title={r.last_modified_remarks || r.remarks || ''}
                        data-testid={`sched-remarks-${r.id}`}
                      >
                        {r.last_modified_remarks || r.remarks || '—'}
                      </span>
                    );
                  case 'client': return r.client_name || '—';
                  case 'vendor': return r.vendor_name || '—';
                  default: return '—';
                }
              };
              return (
                <tr
                  key={r.id}
                  data-testid={`sched-${r.id}`}
                  data-shift={r.shift_type || ''}
                  className={rowBgClass}
                >
                  {visibleCols.map((c, i) => {
                    const bgOverride = columnCellBg(c.key);
                    const textOverride = columnCellText(c.key);
                    const borderOverride = columnCellBorder(c.key);
                    // Sticky first cell must always have an explicit bg
                    // (either the column override or the row tint) so it
                    // doesn't render transparent while scrolling.
                    const stickyClass = i === 0
                      ? `sticky left-0 z-10 ${bgOverride || rowBgClass}`
                      : (bgOverride || '');
                    // Border override must come AFTER `cellBorder` so its
                    // colour class wins the cascade over the default.
                    return (
                      <td
                        key={c.key}
                        className={`px-3 py-2 ${cellBorder} ${borderOverride || ''} ${stickyClass} ${textOverride}`}
                        data-testid={`cell-${c.key}-${r.id}`}
                      >
                        {cellFor(c.key)}
                      </td>
                    );
                  })}
                  <td className={`px-3 py-2 text-right whitespace-nowrap ${cellBorder} ${stickyLastTd}`}>
                    {(canEdit || canCancel || canDelete) ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" data-testid={`row-menu-${r.id}`} aria-label="Row actions">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" data-testid={`row-menu-content-${r.id}`}>
                          {canEdit && (
                            <DropdownMenuItem onClick={() => openEdit(r)} data-testid={`edit-${r.id}`}>Edit</DropdownMenuItem>
                          )}
                          {canCancel && r.shift_status !== 'Cancelled' && (
                            <DropdownMenuItem onClick={() => cancelSchedule(r)} data-testid={`cancel-${r.id}`}>Cancel</DropdownMenuItem>
                          )}
                          {canDelete && (
                            <>
                              {(canEdit || canCancel) && <DropdownMenuSeparator />}
                              <DropdownMenuItem onClick={() => deleteSchedule(r)} data-testid={`delete-${r.id}`}
                                className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950">
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : <span className="text-[#64748B]">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap px-4 py-2 text-xs text-[#64748B] border-t border-[#E2E8F0] dark:border-[#27272A] bg-white dark:bg-[#18181B]">
          <span className="font-semibold text-[#0F172A] dark:text-[#FAFAFA]">Shift colours:</span>
          {Object.entries(SHIFT_ROW_BG).map(([k, cls]) => (
            <span key={k} className="inline-flex items-center gap-2">
              <span className={`w-4 h-4 rounded border border-[#E2E8F0] dark:border-[#27272A] ${cls}`} />
              {k}
            </span>
          ))}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-[#64748B]">Page {page} of {pages}</div>
        <div className="flex items-center gap-2">
          <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{[50, 100, 250].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></Button>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'New'} Dispatch Schedule</DialogTitle>
            <DialogDescription>{editing ? 'Update the shift details for this dispatch.' : 'Assign an officer to a post site for a specific date and shift.'}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Date *</Label><Input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="sf-date" /></div>
            <div><Label>Shift *</Label>
              <Select value={form.shift_type || ''} onValueChange={(v) => setForm({ ...form, shift_type: v })}>
                <SelectTrigger data-testid="sf-shift"><SelectValue /></SelectTrigger>
                <SelectContent>{SHIFT_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Start Time *</Label><Input type="time" value={form.start_time || ''} onChange={(e) => setForm({ ...form, start_time: e.target.value })} data-testid="sf-start" /></div>
            <div><Label>End Time *</Label><Input type="time" value={form.end_time || ''} onChange={(e) => setForm({ ...form, end_time: e.target.value })} data-testid="sf-end" /></div>
            <div><Label>Client *</Label>
              <Select value={form.client_id || ''} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger data-testid="sf-client"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Vendor *</Label>
              <Select value={form.vendor_id || ''} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                <SelectTrigger data-testid="sf-vendor"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Post Site *</Label>
              <Select value={form.post_site_id || ''} onValueChange={(v) => {
                const p = postSites.find(x => x.id === v);
                setForm({ ...form, post_site_id: v, client_id: p?.client_id || form.client_id, vendor_id: p?.vendor_id || form.vendor_id });
              }}>
                <SelectTrigger data-testid="sf-post"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{postSites.map(p => <SelectItem key={p.id} value={p.id}>{p.post_pin} — {p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Security Officer *</Label>
              <Select value={form.officer_id || ''} onValueChange={(v) => setForm({ ...form, officer_id: v })}>
                <SelectTrigger data-testid="sf-officer"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{officers.filter(o => o.status === 'active').map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {canFinancial && <>
              <div><Label>Duty Rate</Label><Input type="number" value={form.duty_rate ?? ''} onChange={(e) => setForm({ ...form, duty_rate: e.target.value ? Number(e.target.value) : null })} data-testid="sf-duty-rate" /></div>
              <div><Label>Billing Rate</Label><Input type="number" value={form.billing_rate ?? ''} onChange={(e) => setForm({ ...form, billing_rate: e.target.value ? Number(e.target.value) : null })} data-testid="sf-billing-rate" /></div>
              <div className="col-span-2"><Label>Work Order Number</Label><Input value={form.work_order_number ?? ''} onChange={(e) => setForm({ ...form, work_order_number: e.target.value })} data-testid="sf-wo" /></div>
            </>}
            <div className="col-span-2"><Label>Remarks</Label><Textarea value={form.remarks ?? ''} onChange={(e) => setForm({ ...form, remarks: e.target.value })} data-testid="sf-remarks" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} className="bg-[#4F46E5] hover:bg-[#4338CA]" data-testid="save-schedule">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      <Dialog open={!!confDialog} onOpenChange={(o) => !o && setConfDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Confirmation</DialogTitle>
            <DialogDescription>Record the confirmation contact status, method and any notes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Status</Label>
              <Select value={confForm.confirmation_status} onValueChange={(v) => setConfForm({ ...confForm, confirmation_status: v })}>
                <SelectTrigger data-testid="cf-status"><SelectValue /></SelectTrigger>
                <SelectContent>{CONF_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Method</Label>
              <Select value={confForm.confirmation_method} onValueChange={(v) => setConfForm({ ...confForm, confirmation_method: v })}>
                <SelectTrigger data-testid="cf-method"><SelectValue /></SelectTrigger>
                <SelectContent>{CONF_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Remarks</Label><Textarea value={confForm.remarks} onChange={(e) => setConfForm({ ...confForm, remarks: e.target.value })} data-testid="cf-remarks" /></div>
            <p className="text-xs text-[#64748B]">Confirmed by: <b>{user?.name}</b> ({user?.role})</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfDialog(null)}>Cancel</Button>
            <Button onClick={submitConfirm} className="bg-[#4F46E5] hover:bg-[#4338CA]" data-testid="save-confirmation">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status change remark dialog */}
      <Dialog open={!!statusDialog} onOpenChange={(o) => !o && setStatusDialog(null)}>
        <DialogContent data-testid="status-remark-dialog">
          <DialogHeader>
            <DialogTitle>Update Status</DialogTitle>
            <DialogDescription>
              Changing status to <b>{statusDialog?.status}</b>. Add an optional remark for the history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Remark (optional)</Label>
              <Textarea
                value={statusRemarks}
                onChange={(e) => setStatusRemarks(e.target.value)}
                placeholder="e.g. Officer arrived 5 minutes late due to traffic"
                data-testid="status-remark-input"
              />
            </div>
            <p className="text-xs text-[#64748B]">
              Recorded by: <b>{user?.name}</b> ({user?.role})
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(null)}>Cancel</Button>
            <Button
              onClick={applyStatus}
              className="bg-[#4F46E5] hover:bg-[#4338CA]"
              disabled={!!statusBusy}
              data-testid="save-status-remark"
            >
              {statusBusy ? 'Saving…' : `Confirm ${statusDialog?.status || ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full History dialog — unified: check-ins, checkouts, edits, cancels, confirmations */}
      <Dialog open={!!actionsDialog} onOpenChange={(o) => !o && setActionsDialog(null)}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto" data-testid="actions-dialog">
          <DialogHeader>
            <DialogTitle>Full History</DialogTitle>
            <DialogDescription>Check-ins, checkouts, confirmations, edits and everything else — newest first.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {actionsLoading ? <p className="text-sm text-[#64748B]">Loading history…</p>
              : actions.length === 0 ? <p className="text-sm text-[#64748B]">No actions recorded yet.</p>
              : actions.map(a => (
                <div key={a.id} className="border border-[#E2E8F0] dark:border-[#27272A] rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[#0F172A] dark:text-[#FAFAFA]">{a.actor_name || 'Unknown'}</span>
                      {a.actor_role && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                          {a.actor_role.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[#64748B]">{a.at?.slice(0, 16).replace('T', ' ')}</span>
                  </div>
                  <div className="mt-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE_MAP[a.action] || 'bg-indigo-100 text-indigo-700'}`}>
                      {a.action}
                    </span>
                  </div>
                  {(a.old_value != null || a.new_value != null) && typeof a.old_value !== 'object' && typeof a.new_value !== 'object' && (
                    <div className="text-xs text-[#64748B] mt-2">
                      <span className="line-through">{a.old_value ?? '—'}</span>
                      {' → '}
                      <span className="font-medium text-[#334155] dark:text-[#E4E4E7]">{a.new_value ?? '—'}</span>
                    </div>
                  )}
                  {(typeof a.old_value === 'object' && a.old_value !== null) && (
                    <div className="text-xs text-[#64748B] mt-2 space-y-0.5">
                      {Object.keys(a.new_value || {}).map((k) => (
                        <div key={k}>
                          <span className="text-[10px] uppercase tracking-wider">{k.replace(/_/g, ' ')}: </span>
                          <span className="line-through">{String(a.old_value?.[k] ?? '—')}</span>
                          {' → '}
                          <span className="font-medium text-[#334155] dark:text-[#E4E4E7]">{String(a.new_value?.[k] ?? '—')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {a.remarks && <div className="text-sm mt-2 text-[#334155] dark:text-[#E4E4E7] italic">"{a.remarks}"</div>}
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters dialog — opens like the Columns chooser */}
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="filters-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Filter className="w-4 h-4" /> Filters</DialogTitle>
            <DialogDescription>Refine which schedule rows appear in the table.</DialogDescription>
          </DialogHeader>
          {activeChips.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-[#E2E8F0] dark:border-[#27272A]" data-testid="active-filters-chips">
              <span className="text-xs font-semibold text-[#64748B]">Applied:</span>
              {activeChips.map(({ k, v }) => (
                <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs">
                  {k.replace('_', ' ')}: {String(v).slice(0, 16)}
                  <button onClick={() => setF(k, '')} data-testid={`chip-clear-${k}`} aria-label={`Clear ${k}`}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div><Label className="text-xs">Officer</Label>
              <Select value={filters.officer_id || 'all'} onValueChange={(v) => setF('officer_id', v === 'all' ? '' : v)}>
                <SelectTrigger data-testid="filter-officer"><SelectValue placeholder="All officers" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All officers</SelectItem>
                  {officers.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Vendor</Label>
              <Select value={filters.vendor_id || 'all'} onValueChange={(v) => setF('vendor_id', v === 'all' ? '' : v)}>
                <SelectTrigger data-testid="filter-vendor"><SelectValue placeholder="All vendors" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All vendors</SelectItem>
                  {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Client</Label>
              <Select value={filters.client_id || 'all'} onValueChange={(v) => setF('client_id', v === 'all' ? '' : v)}>
                <SelectTrigger data-testid="filter-client"><SelectValue placeholder="All clients" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All clients</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Post Site</Label>
              <Select value={filters.post_site_id || 'all'} onValueChange={(v) => setF('post_site_id', v === 'all' ? '' : v)}>
                <SelectTrigger data-testid="filter-post-site"><SelectValue placeholder="All post sites" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All post sites</SelectItem>
                  {postSites.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Post Pin</Label>
              <Input value={filters.post_pin} onChange={(e) => setF('post_pin', e.target.value)} placeholder="PS-102" data-testid="filter-pin" />
            </div>
            <div><Label className="text-xs">Date From</Label>
              <Input type="date" value={filters.date_from} onChange={(e) => setF('date_from', e.target.value)} data-testid="filter-from" />
            </div>
            <div><Label className="text-xs">Date To</Label>
              <Input type="date" value={filters.date_to} onChange={(e) => setF('date_to', e.target.value)} data-testid="filter-to" />
            </div>
            <div><Label className="text-xs">Shift</Label>
              <Select value={filters.shift_type || 'all'} onValueChange={(v) => setF('shift_type', v === 'all' ? '' : v)}>
                <SelectTrigger data-testid="filter-shift"><SelectValue placeholder="All shifts" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All shifts</SelectItem>
                  {SHIFT_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Upcoming Shift Status</Label>
              <Select value={filters.confirmation_status || 'all'} onValueChange={(v) => setF('confirmation_status', v === 'all' ? '' : v)}>
                <SelectTrigger data-testid="filter-conf"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All</SelectItem>
                  {CONF_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Shift Status</Label>
              <Select value={filters.shift_status || 'all'} onValueChange={(v) => setF('shift_status', v === 'all' ? '' : v)}>
                <SelectTrigger data-testid="filter-status"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All</SelectItem>
                  {SHIFT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Work Order</Label>
              <Input value={filters.work_order} onChange={(e) => setF('work_order', e.target.value)} placeholder="WO-123" data-testid="filter-work-order" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => { setFilters(emptyFilters); setPage(1); }}
              disabled={activeChips.length === 0}
              data-testid="filters-clear-btn"
            >
              Clear all
            </Button>
            <Button
              onClick={() => setFiltersOpen(false)}
              className="bg-[#4F46E5] hover:bg-[#4338CA]"
              data-testid="filters-done-btn"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Column chooser dialog */}
      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogContent className="max-w-md" data-testid="column-chooser-dialog">
          <DialogHeader>
            <DialogTitle>Table Columns</DialogTitle>
            <DialogDescription>Drag to reorder, toggle to show or hide. Saved to this browser per user.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 max-h-[420px] overflow-y-auto -mx-1 px-1" data-testid="column-chooser-list">
            {columnConfig.map((c) => {
              const meta = availableCols.find((x) => x.key === c.key);
              if (!meta) return null;
              const isDragging = dragKey === c.key;
              return (
                <li
                  key={c.key}
                  draggable
                  onDragStart={(e) => { setDragKey(c.key); try { e.dataTransfer.effectAllowed = 'move'; } catch { /* no-op */ } }}
                  onDragOver={(e) => { e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch { /* no-op */ } }}
                  onDrop={(e) => { e.preventDefault(); moveColumn(dragKey, c.key); setDragKey(null); }}
                  onDragEnd={() => setDragKey(null)}
                  className={`flex items-center gap-2 p-2 rounded-lg border ${isDragging ? 'border-[#4F46E5] bg-indigo-50 dark:bg-indigo-950' : 'border-[#E2E8F0] dark:border-[#27272A] bg-white dark:bg-[#18181B]'} select-none`}
                  data-testid={`column-item-${c.key}`}
                >
                  <GripVertical className="w-4 h-4 text-[#94A3B8] cursor-grab active:cursor-grabbing" />
                  <span className="flex-1 text-sm text-[#0F172A] dark:text-[#FAFAFA]">{meta.label}</span>
                  <button
                    type="button"
                    onClick={() => toggleColumn(c.key)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border ${c.visible ? 'border-emerald-200 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900' : 'border-slate-200 text-slate-500 bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700'}`}
                    data-testid={`column-toggle-${c.key}`}
                    aria-pressed={c.visible}
                  >
                    {c.visible ? <><Eye className="w-3 h-3" /> Shown</> : <><EyeOff className="w-3 h-3" /> Hidden</>}
                  </button>
                </li>
              );
            })}
          </ul>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={resetColumns} data-testid="column-reset-btn">Reset default</Button>
            <Button onClick={() => setChooserOpen(false)} className="bg-[#4F46E5] hover:bg-[#4338CA]" data-testid="column-done-btn">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DispatchSchedulePage;

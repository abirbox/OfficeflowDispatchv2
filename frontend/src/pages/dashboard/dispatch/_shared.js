// Shared helpers + hooks for dispatch pages
import { useEffect, useState } from 'react';
import { api } from '@/lib/axios';

export function useList(url, params = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let dead = false;
    setLoading(true);
    api.get(url, { params }).then(({ data }) => {
      if (!dead) setData(Array.isArray(data) ? data : data.items || []);
    }).catch(() => !dead && setData([]))
      .finally(() => !dead && setLoading(false));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, JSON.stringify(params), reload]);
  return { data, loading, refetch: () => setReload((x) => x + 1) };
}

export const STATUS_BADGE = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  inactive: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  suspended: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  terminated: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  on_leave: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
};

export const CONFIRM_BADGE = {
  Confirmed:      'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  Pending:        'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  Declined:       'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
  'No Response':  'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800',
  'Not Confirmed':'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600',
};

export default function ReportPager({ count, page, onPage, size = 100 }: { count: number; page: number; onPage: (page: number) => void; size?: number }) {
  const pages = Math.max(1, Math.ceil(count / size));
  return <div className="flex items-center justify-between gap-3 py-3 text-sm"><span>{count} records · Page {Math.min(page, pages)} of {pages}</span><div className="flex gap-3"><button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button><button disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button></div></div>;
}

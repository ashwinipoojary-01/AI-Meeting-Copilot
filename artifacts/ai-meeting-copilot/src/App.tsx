import { useMemo, useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import {
  Activity, ArrowRight, ArrowUpRight, Bell, BookOpen, BrainCircuit,
  Check, CheckCircle2, ChevronDown, ChevronLeft, CircleAlert, Clock3,
  Command, Copy, FileSearch, FileText, Filter, HelpCircle, Inbox, LayoutDashboard,
  Lightbulb, ListChecks, LoaderCircle, Menu, MessageSquareText, Mic2, PlayCircle,
  Plus, RefreshCw, Search, Send, Settings2, ShieldAlert, SlidersHorizontal, Sparkles,
  Target, Trash2, UsersRound, X, Zap,
} from 'lucide-react';
import {
  getGetDashboardQueryKey, getGetMeetingQueryKey, getHealthCheckQueryKey,
  getListActionItemsQueryKey, getListMeetingsQueryKey,
  useAskMeetings, useCreateMeeting, useDeleteMeeting, useGetDashboard, useGetMeeting,
  useHealthCheck, useListActionItems, useListMeetings, useProcessMeeting,
  useSearchMeetings, useUpdateActionItem,
} from '@workspace/api-client-react';
import type {
  ActionItem, AskResponse, Dashboard, Meeting, MeetingDetail, SearchResult,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();

const navPrimary = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/meetings', label: 'Meetings', icon: Mic2 },
  { href: '/action-items', label: 'Action items', icon: ListChecks },
];
const navKnowledge = [
  { href: '/search', label: 'Search knowledge', icon: FileSearch },
  { href: '/ask', label: 'Ask Copilot', icon: BrainCircuit },
];

function cx(...classes: Array<string | false | undefined>) { return classes.filter(Boolean).join(' '); }
function formatDate(value?: string) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatShortDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function initials(value = '') {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'MC';
}
function scorePercent(score = 0) { return `${Math.round(score * 100)}%`; }

function Button({ children, className, variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-primary text-primary-foreground border-primary hover:brightness-105 shadow-sm',
    secondary: 'bg-card text-foreground border-border hover:bg-muted',
    ghost: 'bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground',
    danger: 'bg-transparent text-destructive border-destructive/30 hover:bg-destructive/10',
  };
  return <button {...props} className={cx('inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50', styles[variant], className)}>{children}</button>;
}

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'teal' | 'gold' | 'red' | 'blue' }) {
  const styles = {
    neutral: 'bg-muted text-muted-foreground',
    teal: 'bg-primary/10 text-primary',
    gold: 'bg-accent/25 text-accent-foreground',
    red: 'bg-destructive/10 text-destructive',
    blue: 'bg-chart-3/15 text-chart-3',
  };
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide', styles[tone])}>{children}</span>;
}

function LoadingState({ label = 'Loading workspace' }: { label?: string }) {
  return <div className="space-y-4" data-testid="status-loading">
    <div className="sr-only">{label}</div>
    {[1, 2, 3].map((item) => <div key={item} className="card-surface flex items-center gap-4 rounded-xl p-5"><div className="skeleton h-11 w-11 rounded-lg" /><div className="flex-1 space-y-2"><div className="skeleton h-4 w-2/5 rounded" /><div className="skeleton h-3 w-4/5 rounded" /></div><div className="skeleton h-7 w-16 rounded-full" /></div>)}
  </div>;
}

function ErrorState({ onRetry, label = 'We could not load this view.' }: { onRetry?: () => void; label?: string }) {
  return <div className="card-surface rounded-xl p-10 text-center" data-testid="status-error">
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"><CircleAlert size={23} /></div>
    <h3 className="font-semibold">Something needs a second look</h3>
    <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    {onRetry && <Button variant="secondary" className="mt-5" onClick={onRetry} data-testid="button-retry"><RefreshCw size={15} /> Try again</Button>}
  </div>;
}

function EmptyState({ icon: Icon = Inbox, title, description, action }: { icon?: typeof Inbox; title: string; description: string; action?: ReactNode }) {
  return <div className="card-surface rounded-xl p-12 text-center" data-testid="status-empty">
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary"><Icon size={22} /></div>
    <h3 className="font-semibold">{title}</h3>
    <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>;
}

function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const [location] = useLocation();
  const current = (href: string) => location === href || (href !== '/dashboard' && location.startsWith(href));
  return <aside className={cx('sidebar-surface fixed inset-y-0 left-0 z-40 flex w-[258px] flex-col border-r border-sidebar-border transition-transform duration-300 md:relative md:translate-x-0', mobileOpen ? 'translate-x-0' : '-translate-x-full')} data-testid="sidebar">
    <div className="flex items-center justify-between px-6 pb-8 pt-7">
      <Link href="/dashboard" className="flex items-center gap-3" onClick={onClose} data-testid="link-brand">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Command size={18} strokeWidth={2.5} /></span>
        <span><span className="block text-[15px] font-bold tracking-[-0.02em]">morrow</span><span className="block text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/55">meeting intelligence</span></span>
      </Link>
      <button onClick={onClose} className="rounded-md p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent md:hidden" aria-label="Close navigation" data-testid="button-close-navigation"><X size={18} /></button>
    </div>
    <div className="px-3">
      <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-sidebar-foreground/45">Workspace</div>
      <nav className="space-y-1">
        {navPrimary.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={onClose} className={cx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium', current(href) ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground')} data-testid={`link-nav-${label.toLowerCase().replace(/\s/g, '-')}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Action items' && <span className="ml-auto rounded-full bg-sidebar-primary/20 px-1.5 py-0.5 text-[10px] text-sidebar-primary">6</span>}</Link>)}
      </nav>
      <div className="mb-2 mt-8 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-sidebar-foreground/45">Knowledge</div>
      <nav className="space-y-1">
        {navKnowledge.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={onClose} className={cx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium', current(href) ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground')} data-testid={`link-nav-${label.toLowerCase().replace(/\s/g, '-')}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></Link>)}
      </nav>
    </div>
    <div className="mt-auto p-4">
      <div className="mb-3 rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-sidebar-primary"><Sparkles size={15} /><span className="text-xs font-bold">Copilot is ready</span></div>
        <p className="text-xs leading-5 text-sidebar-foreground/55">Your meeting memory is up to date.</p>
        <Link href="/ask" onClick={onClose} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-sidebar-primary hover:underline" data-testid="link-sidebar-ask">Ask a question <ArrowUpRight size={12} /></Link>
      </div>
      <Link href="/settings" onClick={onClose} className={cx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium', current('/settings') ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground')} data-testid="link-nav-settings"><Settings2 size={17} strokeWidth={1.8} /><span>Settings</span></Link>
    </div>
  </aside>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 60_000 } });
  const title = location === '/dashboard' ? 'Overview' : location.startsWith('/meetings') ? 'Meetings' : location.startsWith('/action-items') ? 'Action items' : location.startsWith('/search') ? 'Search knowledge' : location.startsWith('/ask') ? 'Ask Copilot' : location.startsWith('/settings') ? 'Settings' : 'Workspace';
  return <div className="app-shell flex" data-testid="app-shell">
    <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    {mobileOpen && <button className="fixed inset-0 z-30 bg-foreground/25 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" data-testid="button-navigation-overlay" />}
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b hairline bg-background/90 px-5 backdrop-blur-md md:px-9">
        <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={20} /></button><div><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</div><div className="mt-0.5 text-sm text-foreground/70">{location === '/dashboard' ? 'A clear view of what needs your attention.' : 'Your team’s shared meeting memory.'}</div></div></div>
        <div className="flex items-center gap-3"><Link href="/search" className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 sm:flex" data-testid="link-header-search"><Search size={15} /> Search <kbd className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono-ui text-[10px]">⌘ K</kbd></Link><button className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Notifications" data-testid="button-notifications"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" /></button><Link href="/settings" className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground" data-testid="link-profile-avatar">AR</Link></div>
      </header>
      <main className="mx-auto max-w-[1440px] px-5 py-7 md:px-9 md:py-9">{children}</main>
      <div className="fixed bottom-4 right-4 hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-semibold text-muted-foreground shadow-sm lg:flex" data-testid="status-system"><span className={cx('h-1.5 w-1.5 rounded-full', health.isError ? 'bg-destructive' : 'bg-primary')} /> {health.isError ? 'Connection interrupted' : 'All systems operational'}</div>
    </div>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">{eyebrow && <><span className="h-1.5 w-1.5 rounded-full bg-accent" />{eyebrow}</>}</div><h1 className="font-display text-4xl leading-none tracking-tight text-foreground md:text-5xl">{title}</h1>{description && <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}</div>{action}</div>;
}

function MetricCard({ label, value, detail, icon: Icon, accent = 'teal' }: { label: string; value: number | string; detail: string; icon: typeof Activity; accent?: 'teal' | 'gold' | 'blue' | 'red' }) {
  const colors = { teal: 'bg-primary/10 text-primary', gold: 'bg-accent/25 text-accent-foreground', blue: 'bg-chart-3/15 text-chart-3', red: 'bg-destructive/10 text-destructive' };
  return <div className="card-surface animate-enter rounded-xl p-5" data-testid={`metric-${label.toLowerCase().replace(/\s/g, '-')}`}><div className="flex items-start justify-between"><div><div className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</div><div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div></div><span className={cx('flex h-9 w-9 items-center justify-center rounded-lg', colors[accent])}><Icon size={17} /></span></div><div className="mt-4 text-xs text-muted-foreground">{detail}</div></div>;
}

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const statusTone = meeting.status === 'completed' ? 'teal' : meeting.status === 'failed' ? 'red' : 'gold';
  return <Link href={`/meetings/${meeting.id}`} className="card-surface group block rounded-xl p-5 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--shadow-float)]" data-testid={`card-meeting-${meeting.id}`}>
    <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="mb-2 flex items-center gap-2"><Badge tone={statusTone}>{meeting.status === 'completed' ? 'Ready' : meeting.status}</Badge><span className="font-mono-ui text-[10px] text-muted-foreground">{formatShortDate(meeting.date)}</span></div><h3 className="truncate font-semibold group-hover:text-primary">{meeting.title}</h3><p className="mt-1 truncate text-xs text-muted-foreground">{meeting.clientName} · {meeting.meetingType}</p></div><ArrowUpRight size={17} className="shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" /></div>
    <div className="mt-5 flex items-center justify-between border-t hairline pt-4 text-xs text-muted-foreground"><div className="flex items-center gap-3"><span className="inline-flex items-center gap-1"><Clock3 size={13} />{meeting.duration || '—'}</span><span className="inline-flex items-center gap-1"><UsersRound size={13} />{meeting.participants?.length || 0}</span></div><div className="flex items-center gap-2"><span>{meeting.actionItemCount} action items</span><span className="h-1 w-1 rounded-full bg-border" /><span>{meeting.decisionCount} decisions</span></div></div>
  </Link>;
}

function DashboardPage() {
  const dashboard = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  if (dashboard.isLoading) return <><PageHeading eyebrow="Workspace pulse" title="Good morning, Alex." description="Loading the latest shape of your meeting memory." /><LoadingState /></>;
  if (dashboard.isError || !dashboard.data) return <><PageHeading eyebrow="Workspace pulse" title="Good morning, Alex." /><ErrorState onRetry={() => dashboard.refetch()} /></>;
  const data = dashboard.data as Dashboard;
  const maxActivity = Math.max(...(data.activity || []).map((item) => item.meetings), 1);
  return <div className="space-y-8">
    <PageHeading eyebrow="Workspace pulse" title="Good morning, Alex." description="A clear view of what needs your attention, what moved forward, and what is still unresolved." action={<Link href="/meetings/new" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105" data-testid="link-new-meeting"><Plus size={17} /> New meeting</Link>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Meetings captured" value={data.totalMeetings} detail="Across the current workspace" icon={Mic2} /><MetricCard label="Action items" value={data.actionItems} detail={`${data.pendingItems} still need attention`} icon={ListChecks} accent="gold" /><MetricCard label="Completed" value={data.completedItems} detail="Closed with clear ownership" icon={CheckCircle2} accent="blue" /><MetricCard label="Open decisions" value={data.recentDecisions?.length || 0} detail="From your latest conversations" icon={Target} accent="red" /></div>
    <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <section className="card-surface animate-enter animate-enter-1 rounded-xl p-6" data-testid="section-activity"><div className="mb-7 flex items-start justify-between"><div><h2 className="font-semibold">Meeting activity</h2><p className="mt-1 text-xs text-muted-foreground">Conversations captured over the last 7 weeks</p></div><Badge tone="teal">Live workspace</Badge></div><div className="flex h-48 items-end gap-2 border-b border-l border-border px-3 pb-0 pt-4 sm:gap-4">{(data.activity || []).map((item, index) => <div className="group flex h-full flex-1 flex-col justify-end gap-2" key={`${item.label}-${index}`}><div className="relative flex-1"><div className="absolute inset-x-0 bottom-0 rounded-t-md bg-primary/20 transition-all group-hover:bg-primary/40" style={{ height: `${Math.max((item.meetings / maxActivity) * 100, 7)}%` }}><div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-semibold opacity-0 transition-opacity group-hover:opacity-100">{item.meetings}</div></div></div><span className="font-mono-ui text-center text-[10px] text-muted-foreground">{item.label}</span></div>)}</div></section>
      <section className="card-surface animate-enter animate-enter-2 rounded-xl p-6" data-testid="section-upcoming-deadlines"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Coming up</h2><p className="mt-1 text-xs text-muted-foreground">Deadlines worth a look</p></div><Link href="/action-items" className="text-xs font-bold text-primary hover:underline" data-testid="link-view-action-items">View all</Link></div>{data.upcomingDeadlines?.length ? <div className="space-y-4">{data.upcomingDeadlines.slice(0, 4).map((item) => <ActionMini key={item.id} item={item} />)}</div> : <EmptyState icon={Check} title="Clear runway" description="No upcoming deadlines need your attention." />}</section>
    </div>
    <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <section className="animate-enter animate-enter-2" data-testid="section-recent-meetings"><div className="mb-4 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Recent meetings</h2><p className="mt-1 text-xs text-muted-foreground">Your latest conversations and their follow-through.</p></div><Link href="/meetings" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline" data-testid="link-view-meetings">Meeting library <ArrowRight size={13} /></Link></div>{data.recentMeetings?.length ? <div className="grid gap-4 md:grid-cols-2">{data.recentMeetings.slice(0, 4).map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} />)}</div> : <EmptyState icon={Mic2} title="Your library is quiet" description="Create your first meeting to start building searchable memory." action={<Link href="/meetings/new" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" data-testid="link-empty-new-meeting"><Plus size={15} /> Add a meeting</Link>} />}</section>
      <section className="animate-enter animate-enter-3" data-testid="section-decisions"><div className="mb-4"><h2 className="text-lg font-semibold">Recent decisions</h2><p className="mt-1 text-xs text-muted-foreground">Commitments made in the room.</p></div><div className="card-surface divide-y divide-border rounded-xl">{data.recentDecisions?.length ? data.recentDecisions.slice(0, 5).map((decision) => <div key={decision.id} className="p-4"><div className="flex items-start gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/30 text-accent-foreground"><Check size={13} /></span><div><p className="text-sm leading-5">{decision.text}</p><Link href="/meetings" className="mt-2 inline-flex items-center gap-1 font-mono-ui text-[10px] text-muted-foreground hover:text-primary" data-testid={`link-decision-${decision.id}`}>{decision.timestamp} <ArrowUpRight size={11} /></Link></div></div></div>) : <div className="p-8 text-center text-sm text-muted-foreground">No decisions captured yet.</div>}</div></section>
    </div>
  </div>;
}

function ActionMini({ item }: { item: ActionItem }) {
  return <div className="flex gap-3" data-testid={`deadline-${item.id}`}><div className={cx('mt-0.5 h-2 w-2 shrink-0 rounded-full', item.priority === 'HIGH' ? 'bg-destructive' : item.priority === 'MEDIUM' ? 'bg-accent' : 'bg-primary')} /><div className="min-w-0"><p className="truncate text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.owner} · due {formatShortDate(item.deadline)}</p></div></div>;
}

function MeetingsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'completed' | 'processing' | 'failed'>('all');
  const params = useMemo(() => ({ search: search || undefined, status }), [search, status]);
  const meetings = useListMeetings(params, { query: { queryKey: getListMeetingsQueryKey(params) } });
  return <div><PageHeading eyebrow="Meeting library" title="Every conversation, findable." description="Browse the source material behind your team’s decisions, commitments, and context." action={<Link href="/meetings/new" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105" data-testid="link-meetings-new"><Plus size={17} /> New meeting</Link>} />
    <div className="mb-6 flex flex-col gap-3 md:flex-row"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search titles, clients, or meeting types" className="w-full rounded-lg border border-input bg-card py-2.5 pl-10 pr-4 text-sm" data-testid="input-meeting-search" /></label><div className="relative"><Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} /><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-full min-w-[150px] appearance-none rounded-lg border border-input bg-card py-2.5 pl-9 pr-9 text-sm" data-testid="select-meeting-status"><option value="all">All statuses</option><option value="completed">Ready</option><option value="processing">Processing</option><option value="failed">Needs review</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} /></div></div>
    {meetings.isLoading ? <LoadingState label="Loading meetings" /> : meetings.isError ? <ErrorState onRetry={() => meetings.refetch()} /> : meetings.data?.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{meetings.data.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} />)}</div> : <EmptyState icon={Search} title="No meetings match that search" description="Try a broader phrase or clear the status filter to see more of your library." action={<Button variant="secondary" onClick={() => { setSearch(''); setStatus('all'); }} data-testid="button-clear-meeting-filters"><X size={15} /> Clear filters</Button>} />}
  </div>;
}

function NewMeetingPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createMeeting = useCreateMeeting();
  const [form, setForm] = useState({ title: '', meetingType: 'Client call', clientName: '', date: new Date().toISOString().slice(0, 16), participants: '', description: '' });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); if (!form.title.trim() || !form.participants.trim()) return; createMeeting.mutate({ data: { ...form, title: form.title.trim(), participants: form.participants.split(',').map((person) => person.trim()).filter(Boolean) } }, { onSuccess: (meeting) => { queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() }); setLocation(`/meetings/${meeting.id}`); } }); };
  return <div className="mx-auto max-w-3xl"><Link href="/meetings" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary" data-testid="link-back-meetings"><ChevronLeft size={16} /> Meeting library</Link><PageHeading eyebrow="New record" title="Capture a meeting." description="Give the conversation a home. You can add the transcript and analysis after it is created." />
    <form onSubmit={submit} className="card-surface rounded-xl p-6 md:p-8" data-testid="form-new-meeting"><div className="grid gap-5 md:grid-cols-2"><label className="md:col-span-2"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Meeting title</span><input required value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="e.g. Northstar renewal review" className="w-full rounded-lg border border-input bg-background px-3.5 py-3 text-sm" data-testid="input-meeting-title" /></label><label><span className="mb-2 block text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Meeting type</span><select value={form.meetingType} onChange={(event) => update('meetingType', event.target.value)} className="w-full rounded-lg border border-input bg-background px-3.5 py-3 text-sm" data-testid="select-meeting-type"><option>Client call</option><option>Team sync</option><option>Planning</option><option>Interview</option><option>One-on-one</option></select></label><label><span className="mb-2 block text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Client or team</span><input value={form.clientName} onChange={(event) => update('clientName', event.target.value)} placeholder="e.g. Northstar Labs" className="w-full rounded-lg border border-input bg-background px-3.5 py-3 text-sm" data-testid="input-client-name" /></label><label><span className="mb-2 block text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Date and time</span><input required type="datetime-local" value={form.date} onChange={(event) => update('date', event.target.value)} className="w-full rounded-lg border border-input bg-background px-3.5 py-3 text-sm" data-testid="input-meeting-date" /></label><label><span className="mb-2 block text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Participants</span><input required value={form.participants} onChange={(event) => update('participants', event.target.value)} placeholder="Comma separated names" className="w-full rounded-lg border border-input bg-background px-3.5 py-3 text-sm" data-testid="input-participants" /></label><label className="md:col-span-2"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Context <span className="font-normal normal-case tracking-normal text-muted-foreground/70">Optional</span></span><textarea value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="What should Copilot pay attention to?" className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3.5 py-3 text-sm" data-testid="textarea-meeting-description" /></label></div><div className="mt-7 flex items-center justify-end gap-3 border-t hairline pt-6"><Link href="/meetings" className="rounded-lg px-3.5 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted" data-testid="link-cancel-meeting">Cancel</Link><Button type="submit" disabled={createMeeting.isPending} data-testid="button-create-meeting">{createMeeting.isPending ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />} {createMeeting.isPending ? 'Creating…' : 'Create meeting'}</Button></div>{createMeeting.isError && <p className="mt-4 text-right text-sm text-destructive" data-testid="text-create-error">We could not create that meeting. Try again.</p>}</form>
  </div>;
}

function MeetingPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const meeting = useGetMeeting(id, { query: { queryKey: getGetMeetingQueryKey(id), enabled: Boolean(id) } });
  const queryClient = useQueryClient();
  const deleteMeeting = useDeleteMeeting();
  const processMeeting = useProcessMeeting();
  const [tab, setTab] = useState<'summary' | 'transcript' | 'analysis'>('summary');
  const [showDelete, setShowDelete] = useState(false);
  const detail = meeting.data as MeetingDetail | undefined;
  const remove = () => deleteMeeting.mutate({ id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() }); setLocation('/meetings'); } });
  const process = () => processMeeting.mutate({ id, data: { demo: true } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetMeetingQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); } });
  if (meeting.isLoading) return <><PageHeading eyebrow="Meeting record" title="Loading meeting" /><LoadingState /></>;
  if (meeting.isError || !detail) return <><Link href="/meetings" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary" data-testid="link-meeting-error-back"><ChevronLeft size={16} /> Meeting library</Link><ErrorState onRetry={() => meeting.refetch()} /></>;
  return <div className="space-y-7">
    <div><Link href="/meetings" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary" data-testid="link-meeting-back"><ChevronLeft size={16} /> Meeting library</Link><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-3 flex items-center gap-2"><Badge tone={detail.status === 'completed' ? 'teal' : 'gold'}>{detail.status}</Badge><span className="font-mono-ui text-[10px] text-muted-foreground">{formatDate(detail.date)} · {detail.duration || 'Duration pending'}</span></div><h1 className="max-w-3xl font-display text-4xl leading-[.95] tracking-tight md:text-5xl" data-testid="text-meeting-title">{detail.title}</h1><div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{detail.clientName && <span>{detail.clientName}</span>}<span className="h-1 w-1 rounded-full bg-border" /><span>{detail.participants?.join(', ')}</span></div></div><div className="flex items-center gap-2"><Button variant="secondary" onClick={process} disabled={processMeeting.isPending} data-testid="button-process-meeting">{processMeeting.isPending ? <LoaderCircle className="animate-spin" size={15} /> : <PlayCircle size={15} />} {processMeeting.isPending ? 'Processing…' : 'Process again'}</Button><Button variant="danger" onClick={() => setShowDelete(true)} data-testid="button-delete-meeting"><Trash2 size={15} /> Delete</Button></div></div></div>
    <div className="flex gap-1 border-b border-border" role="tablist">{(['summary', 'transcript', 'analysis'] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={cx('border-b-2 px-4 py-3 text-sm font-semibold capitalize', tab === item ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')} role="tab" aria-selected={tab === item} data-testid={`tab-meeting-${item}`}>{item}</button>)}</div>
    {tab === 'summary' && <SummaryTab detail={detail} />}{tab === 'transcript' && <TranscriptTab detail={detail} />}{tab === 'analysis' && <AnalysisTab detail={detail} />}
    {showDelete && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-5" role="dialog" aria-modal="true" data-testid="dialog-delete-meeting"><div className="card-surface w-full max-w-md rounded-xl p-6 shadow-[var(--shadow-float)]"><div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><Trash2 size={18} /></div><h2 className="text-lg font-semibold">Delete this meeting?</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">This removes the meeting from the workspace and cannot be undone.</p><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={() => setShowDelete(false)} data-testid="button-cancel-delete">Cancel</Button><Button variant="danger" onClick={remove} disabled={deleteMeeting.isPending} data-testid="button-confirm-delete">{deleteMeeting.isPending ? 'Deleting…' : 'Delete meeting'}</Button></div></div></div>}
  </div>;
}

function SummaryTab({ detail }: { detail: MeetingDetail }) {
  return <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]"><div className="space-y-6"><section className="card-surface rounded-xl p-6" data-testid="section-meeting-summary"><div className="mb-4 flex items-center gap-2 text-primary"><Sparkles size={17} /><h2 className="font-semibold text-foreground">Executive summary</h2></div><p className="text-[15px] leading-7 text-foreground/80">{detail.summary || 'This meeting has not been summarized yet. Process the record to generate a concise view of what mattered.'}</p></section><section className="card-surface rounded-xl p-6" data-testid="section-decisions"><div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-2"><Target size={17} className="text-primary" /><h2 className="font-semibold">Decisions</h2></div><Badge tone="teal">{detail.decisions?.length || 0} captured</Badge></div>{detail.decisions?.length ? <div className="space-y-4">{detail.decisions.map((decision) => <div key={decision.id} className="flex gap-3 border-l-2 border-accent pl-4"><div><p className="text-sm leading-6">{decision.text}</p><span className="mt-1 block font-mono-ui text-[10px] text-muted-foreground">{decision.timestamp}</span></div></div>)}</div> : <p className="text-sm text-muted-foreground">No decisions captured in this conversation.</p>}</section></div><div className="space-y-6"><InsightList title="Topics" icon={BookOpen} items={detail.topics} empty="No topics identified yet." tone="blue" /><InsightList title="Risks to watch" icon={ShieldAlert} items={detail.risks} empty="No risks flagged." tone="red" /><InsightList title="Open questions" icon={HelpCircle} items={detail.openQuestions} empty="No open questions." tone="gold" /></div></div>;
}

function InsightList({ title, icon: Icon, items = [], empty, tone }: { title: string; icon: typeof BookOpen; items?: string[]; empty: string; tone: 'blue' | 'red' | 'gold' }) {
  return <section className="card-surface rounded-xl p-6"><div className="mb-4 flex items-center gap-2"><Icon size={17} className={cx(tone === 'red' ? 'text-destructive' : tone === 'gold' ? 'text-accent-foreground' : 'text-chart-3')} /><h2 className="font-semibold">{title}</h2></div>{items.length ? <ul className="space-y-3">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2.5 text-sm leading-5 text-foreground/75"><span className={cx('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', tone === 'red' ? 'bg-destructive' : tone === 'gold' ? 'bg-accent' : 'bg-chart-3')} />{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}</section>;
}

function TranscriptTab({ detail }: { detail: MeetingDetail }) {
  return <section className="card-surface rounded-xl p-6 md:p-8" data-testid="section-transcript"><div className="mb-7 flex items-center justify-between"><div><h2 className="font-semibold">Transcript</h2><p className="mt-1 text-xs text-muted-foreground">Searchable conversation record</p></div><Button variant="secondary" onClick={() => navigator.clipboard?.writeText(detail.transcript?.map((line) => `${line.speaker}: ${line.text}`).join('\n') || '')} data-testid="button-copy-transcript"><Copy size={14} /> Copy</Button></div>{detail.transcript?.length ? <div className="space-y-7">{detail.transcript.map((line) => <div key={line.id} className="grid gap-3 sm:grid-cols-[120px_1fr]"><div className="flex items-start gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-primary">{initials(line.speaker)}</span><div><div className="text-xs font-semibold">{line.speaker}</div><div className="mt-1 font-mono-ui text-[10px] text-muted-foreground">{line.timestamp}</div></div></div><p className="max-w-3xl text-sm leading-7 text-foreground/80">{line.text}</p></div>)}</div> : <EmptyState icon={MessageSquareText} title="Transcript not available" description="Process this meeting to generate its searchable conversation record." />}</section>;
}

function AnalysisTab({ detail }: { detail: MeetingDetail }) {
  return <div className="grid gap-6 md:grid-cols-2"><section className="card-surface rounded-xl p-6"><div className="mb-5 flex items-center gap-2"><Lightbulb size={17} className="text-accent-foreground" /><h2 className="font-semibold">Signal map</h2></div><div className="space-y-4"><div><div className="mb-2 flex justify-between text-xs"><span className="text-muted-foreground">Topics surfaced</span><span className="font-semibold">{detail.topics?.length || 0}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full w-[72%] rounded-full bg-primary" /></div></div><div><div className="mb-2 flex justify-between text-xs"><span className="text-muted-foreground">Decisions recorded</span><span className="font-semibold">{detail.decisions?.length || 0}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full w-[54%] rounded-full bg-accent" /></div></div><div><div className="mb-2 flex justify-between text-xs"><span className="text-muted-foreground">Follow-through confidence</span><span className="font-semibold">High</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full w-[84%] rounded-full bg-chart-3" /></div></div></div></section><section className="card-surface rounded-xl p-6"><div className="mb-5 flex items-center gap-2"><Zap size={17} className="text-primary" /><h2 className="font-semibold">Copilot notes</h2></div><div className="space-y-4 text-sm leading-6 text-muted-foreground"><p>Analysis is grounded in the transcript and the decisions captured from this record.</p><p>Use the Ask Copilot view to connect this conversation to other meetings across the workspace.</p><Link href={`/search?q=${encodeURIComponent(detail.title)}`} className="inline-flex items-center gap-2 font-semibold text-primary hover:underline" data-testid="link-search-meeting"><Search size={14} /> Find related context <ArrowRight size={14} /></Link></div></section></div>;
}

function ActionItemsPage() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'overdue'>('pending');
  const params = useMemo(() => ({ status: filter }), [filter]);
  const items = useListActionItems(params, { query: { queryKey: getListActionItemsQueryKey(params) } });
  const queryClient = useQueryClient();
  const updateItem = useUpdateActionItem();
  const toggle = (item: ActionItem) => updateItem.mutate({ id: item.id, data: { status: item.status === 'completed' ? 'pending' : 'completed' } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListActionItemsQueryKey() }) });
  return <div><PageHeading eyebrow="Follow-through" title="Action items" description="The small promises that make meetings useful. Keep ownership visible and momentum intact." action={<div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground"><Target size={15} /> {items.data?.filter((item) => item.status === 'pending').length || 0} to close</div>} />
    <div className="mb-6 flex flex-wrap gap-2">{(['pending', 'completed', 'all', 'overdue'] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={cx('rounded-full border px-3.5 py-2 text-xs font-bold capitalize', filter === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary')} data-testid={`button-filter-${item}`}>{item}</button>)}</div>
    {items.isLoading ? <LoadingState label="Loading action items" /> : items.isError ? <ErrorState onRetry={() => items.refetch()} /> : items.data?.length ? <div className="card-surface divide-y divide-border rounded-xl" data-testid="list-action-items">{items.data.map((item) => <ActionRow item={item} key={item.id} onToggle={() => toggle(item)} isPending={updateItem.isPending} />)}</div> : <EmptyState icon={ListChecks} title={filter === 'completed' ? 'Nothing completed yet' : 'Your runway is clear'} description={filter === 'pending' ? 'When Copilot finds a commitment, it will appear here with an owner and deadline.' : 'No action items match this view.'} />}</div>;
}

function ActionRow({ item, onToggle, isPending }: { item: ActionItem; onToggle: () => void; isPending: boolean }) {
  return <div className="flex flex-col gap-4 p-5 transition-colors hover:bg-muted/35 sm:flex-row sm:items-center" data-testid={`row-action-item-${item.id}`}><button onClick={onToggle} disabled={isPending} className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2', item.status === 'completed' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-transparent hover:border-primary')} aria-label={item.status === 'completed' ? 'Mark pending' : 'Mark complete'} data-testid={`button-toggle-action-${item.id}`}><Check size={13} strokeWidth={3} /></button><div className="min-w-0 flex-1"><div className={cx('text-sm font-semibold', item.status === 'completed' && 'text-muted-foreground line-through')}>{item.title}</div><div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"><span>{item.owner || 'Unassigned'}</span><span className="h-1 w-1 rounded-full bg-border" /><Link href={`/meetings/${item.meetingId}`} className="hover:text-primary" data-testid={`link-action-meeting-${item.id}`}>{item.meetingTitle}</Link></div>{item.description && <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p>}</div><div className="flex shrink-0 items-center gap-3 pl-10 sm:pl-0"><div className="text-right"><div className={cx('font-mono-ui text-[11px]', new Date(item.deadline) < new Date() && item.status === 'pending' ? 'text-destructive' : 'text-muted-foreground')}>{formatShortDate(item.deadline)}</div><div className="mt-1 text-[10px] text-muted-foreground">due date</div></div><Badge tone={item.priority === 'HIGH' ? 'red' : item.priority === 'MEDIUM' ? 'gold' : 'neutral'}>{item.priority}</Badge></div></div>;
}

function SearchPage() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'semantic' | 'keyword'>('semantic');
  const search = useSearchMeetings();
  const submit = (event: FormEvent) => { event.preventDefault(); if (query.trim()) search.mutate({ data: { query: query.trim(), mode } }); };
  return <div><PageHeading eyebrow="Knowledge retrieval" title="Search the room." description="Find the exact moment a topic came up, even when you do not remember which meeting it was in." /><form onSubmit={submit} className="card-surface mb-8 rounded-xl p-4 md:p-5" data-testid="form-search"><div className="flex flex-col gap-3 md:flex-row"><div className="relative min-w-0 flex-1"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “renewal risk” or “timeline for launch”" className="w-full rounded-lg border border-input bg-background py-3 pl-11 pr-4 text-sm" data-testid="input-search-query" /></div><div className="flex gap-2"><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="rounded-lg border border-input bg-background px-3 text-sm" data-testid="select-search-mode"><option value="semantic">Semantic</option><option value="keyword">Keyword</option></select><Button type="submit" disabled={search.isPending || !query.trim()} data-testid="button-run-search">{search.isPending ? <LoaderCircle className="animate-spin" size={16} /> : <Search size={16} />} Search</Button></div></div><div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><SlidersHorizontal size={13} /> {mode === 'semantic' ? 'Meaning-aware search across summaries and transcripts' : 'Exact words and phrases across your meeting library'}</div></form>{search.isError ? <ErrorState onRetry={() => query.trim() && search.mutate({ data: { query: query.trim(), mode } })} /> : search.data ? search.data.length ? <div className="space-y-3" data-testid="list-search-results"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">{search.data.length} relevant moments</h2><span className="font-mono-ui text-[10px] text-muted-foreground">sorted by relevance</span></div>{search.data.map((result) => <SearchResultRow key={`${result.meetingId}-${result.timestamp}-${result.speaker}`} result={result} />)}</div> : <EmptyState icon={Search} title="No relevant moments found" description="Try a different phrase, or switch between semantic and keyword search." /> : <div className="grid gap-4 md:grid-cols-3"><div className="card-surface rounded-xl p-5"><BrainCircuit size={18} className="mb-4 text-primary" /><h3 className="font-semibold">Search by meaning</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Ask for an idea, not just a phrase. Copilot connects the language people used to the context they meant.</p></div><div className="card-surface rounded-xl p-5"><FileText size={18} className="mb-4 text-accent-foreground" /><h3 className="font-semibold">Jump to the source</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Every result keeps its meeting, speaker, and timestamp attached for fast verification.</p></div><div className="card-surface rounded-xl p-5"><ShieldAlert size={18} className="mb-4 text-chart-3" /><h3 className="font-semibold">Keep the nuance</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Use the original conversation to make decisions with the full story, not a loose recollection.</p></div></div>}</div>;
}

function SearchResultRow({ result }: { result: SearchResult }) {
  return <Link href={`/meetings/${result.meetingId}`} className="card-surface group block rounded-xl p-5 hover:border-primary/30" data-testid={`result-search-${result.meetingId}-${result.timestamp}`}><div className="flex flex-col gap-4 md:flex-row md:items-start"><div className="flex items-center gap-3 md:w-44 md:shrink-0"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-primary">{initials(result.speaker)}</span><div><div className="text-xs font-semibold">{result.speaker}</div><div className="font-mono-ui text-[10px] text-muted-foreground">{result.timestamp}</div></div></div><div className="min-w-0 flex-1"><div className="mb-1 text-xs font-bold text-primary">{result.meetingTitle}</div><p className="text-sm leading-6 text-foreground/80">{result.snippet}</p></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>{scorePercent(result.score)} match</span><ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" /></div></div></Link>;
}

function AskPage() {
  const [question, setQuestion] = useState('');
  const ask = useAskMeetings();
  const response = ask.data as AskResponse | undefined;
  const submit = (event: FormEvent) => { event.preventDefault(); if (question.trim()) ask.mutate({ data: { question: question.trim() } }); };
  return <div className="mx-auto max-w-5xl"><PageHeading eyebrow="Grounded answers" title="Ask the memory." description="A useful answer should show its work. Every response is grounded in your meeting records with sources you can inspect." /><div className="grid gap-6 lg:grid-cols-[1fr_280px]"><div><form onSubmit={submit} className="card-surface rounded-xl p-5" data-testid="form-ask"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><BrainCircuit size={17} className="text-primary" /> What do you want to know?</div><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Which launch risks are still unresolved?" className="min-h-32 w-full resize-none rounded-lg border border-input bg-background p-4 text-sm leading-6" data-testid="textarea-ask-question" /><div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">Answers stay within your meeting workspace.</span><Button type="submit" disabled={ask.isPending || !question.trim()} data-testid="button-ask">{ask.isPending ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />} {ask.isPending ? 'Thinking…' : 'Ask Copilot'}</Button></div></form>{ask.isError ? <div className="mt-6"><ErrorState onRetry={() => question.trim() && ask.mutate({ data: { question: question.trim() } })} label="The answer could not be grounded right now." /></div> : response ? <AnswerCard response={response} /> : <div className="mt-6 rounded-xl border border-dashed border-border p-10 text-center"><MessageSquareText className="mx-auto mb-3 text-muted-foreground" size={25} /><p className="text-sm font-semibold">Your answer will appear here</p><p className="mt-1 text-xs text-muted-foreground">Ask about decisions, owners, risks, or what changed over time.</p></div>}</div><aside className="space-y-4"><div className="card-surface rounded-xl p-5"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><ShieldAlert size={16} className="text-chart-3" /> Grounded by default</div><p className="text-xs leading-5 text-muted-foreground">Copilot only answers from the meetings in this workspace. Sources keep every claim reviewable.</p></div><div className="card-surface rounded-xl p-5"><div className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Try asking</div><div className="space-y-2">{['What did we decide about pricing?', 'Who owns the launch plan?', 'What risks came up twice?'].map((prompt) => <button key={prompt} onClick={() => setQuestion(prompt)} className="block w-full rounded-lg bg-muted px-3 py-2.5 text-left text-xs leading-5 text-foreground/75 hover:bg-secondary hover:text-primary" data-testid={`button-prompt-${prompt.slice(0, 8)}`}>{prompt}</button>)}</div></div></aside></div></div>;
}

function AnswerCard({ response }: { response: AskResponse }) {
  return <section className="card-surface mt-6 overflow-hidden rounded-xl" data-testid="card-ask-answer"><div className="border-b border-border bg-secondary/40 p-6"><div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><Sparkles size={14} /> Copilot answer</div><p className="text-[15px] leading-7 text-foreground/85">{response.answer}</p></div><div className="p-6"><div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold">Sources</h3><span className="font-mono-ui text-[10px] text-muted-foreground">{response.sources?.length || 0} references</span></div><div className="space-y-3">{response.sources?.map((source, index) => <Link key={`${source.meetingId}-${source.timestamp}-${index}`} href={`/meetings/${source.meetingId}`} className="group block rounded-lg border border-border p-4 hover:border-primary/40" data-testid={`source-ask-${index}`}><div className="mb-2 flex items-center justify-between gap-3"><div className="text-xs font-bold text-primary">{source.meetingTitle}</div><span className="font-mono-ui text-[10px] text-muted-foreground">{source.timestamp}</span></div><p className="text-sm leading-6 text-muted-foreground group-hover:text-foreground/75">“{source.quote}”</p></Link>)}</div></div></section>;
}

function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState('Alex Rivera');
  const [email, setEmail] = useState('alex@northstar.co');
  const [digest, setDigest] = useState(true);
  const save = (event: FormEvent) => { event.preventDefault(); setSaved(true); window.setTimeout(() => setSaved(false), 2600); };
  return <div className="mx-auto max-w-4xl"><PageHeading eyebrow="Workspace preferences" title="Settings" description="Tune how your meeting memory behaves and how Copilot keeps you in the loop." /><form onSubmit={save} className="space-y-6" data-testid="form-settings"><section className="card-surface rounded-xl p-6 md:p-8"><div className="mb-6 flex items-start gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">AR</div><div><h2 className="font-semibold">Your profile</h2><p className="mt-1 text-xs text-muted-foreground">This is how your name appears on action items.</p></div></div><div className="grid gap-5 md:grid-cols-2"><label><span className="mb-2 block text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Full name</span><input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-lg border border-input bg-background px-3.5 py-3 text-sm" data-testid="input-profile-name" /></label><label><span className="mb-2 block text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-input bg-background px-3.5 py-3 text-sm" data-testid="input-profile-email" /></label></div></section><section className="card-surface rounded-xl p-6 md:p-8"><div className="mb-6 flex items-start gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/30 text-accent-foreground"><Bell size={18} /></div><div><h2 className="font-semibold">Notifications</h2><p className="mt-1 text-xs text-muted-foreground">A short summary is often better than another tab.</p></div></div><label className="flex cursor-pointer items-center justify-between gap-5 rounded-lg border border-border p-4 hover:bg-muted/40"><div><div className="text-sm font-semibold">Weekly follow-through digest</div><p className="mt-1 text-xs leading-5 text-muted-foreground">Receive a summary of open action items and decisions every Monday.</p></div><input type="checkbox" checked={digest} onChange={(event) => setDigest(event.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" data-testid="checkbox-weekly-digest" /></label></section><div className="flex items-center justify-end gap-3">{saved && <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary" data-testid="status-settings-saved"><Check size={14} /> Preferences saved</span>}<Button type="submit" data-testid="button-save-settings">Save preferences</Button></div></form></div>;
}

function HomeRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation('/dashboard'); }, [setLocation]);
  return <div className="flex min-h-[60vh] items-center justify-center"><LoaderCircle className="animate-spin text-primary" size={24} /></div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><AppShell><Switch><Route path="/" component={HomeRedirect} /><Route path="/dashboard" component={DashboardPage} /><Route path="/meetings/new" component={NewMeetingPage} /><Route path="/meetings/:id" component={MeetingPage} /><Route path="/meetings" component={MeetingsPage} /><Route path="/action-items" component={ActionItemsPage} /><Route path="/search" component={SearchPage} /><Route path="/ask" component={AskPage} /><Route path="/settings" component={SettingsPage} /><Route component={NotFound} /></Switch></AppShell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
import React, { useEffect, useMemo, useState } from "react";
import {
  FiList,
  FiInbox,
  FiAward,
  FiPlusCircle,
  FiUpload,
  FiCheckCircle,
  FiSend,
  FiTrendingUp,
  FiBook,
  FiUser,
  FiStar,
} from "react-icons/fi";
import { useSkillMatrixNav } from "../context/SkillMatrixNavContext";
import { getTrainingStatus } from "../features/training/shared/config/trainingStatusBuckets";
import { useIsMobile } from "../hooks/useMediaQuery";
import TrainingProgressCard from "../features/training/shared/components/TrainingProgressCard";
import PendingApprovalsCard from "../features/training/shared/components/PendingApprovalsCard";
import OpenBatchesCard from "../features/training/shared/components/OpenBatchesCard";
import ViewAllLink from "../features/training/shared/components/ViewAllLink";
import useOpenBatchesCard from "../hooks/useOpenBatchesCard";
import { HOME_PROGRESS_BUCKET_CONFIG, bucketHomeProgressTrainings } from "../features/training/shared/config/trainingStatusBuckets";
import { getAvailableYears, filterTrainingsByYear, ALL_YEARS } from "../features/training/shared/config/trainingYearFilter";
import { countOpenEnrollmentBatches } from "../features/training/my-trainings/services/newOpenEnrollmentCount";
import { fetchBatches } from "../helper/trainingBatchesApi";
import SelfManagerToggle from "../features/training/shared/components/SelfManagerToggle";
import { useAuth } from "../hooks/useAuth";
import { useManagerApprovals } from "../context/ManagerApprovalsContext";
import { useGoToTrainingBatches } from "../hooks/useGoToTrainingBatches";
import { BATCH_SCOPE } from "../features/training/training-batch/services/batchScopes";
import { BATCH_VIEW_ORIGIN } from "../features/training/training-batch/services/batchViewOrigin";

const CURRENT_YEAR = new Date().getFullYear();
const DECISION_ITEM = { icon: FiInbox, ownership: "TEAM NOMINATION", status: "Needs your decision", actionLabel: "Review" }; // rows the user must decide
const REQUEST_ITEM = { icon: FiSend, ownership: "MY NOMINATION", status: "Awaiting approval" }; // the user's own requests

// Consistent card-lift hover across every dashboard widget — translateY +
// shadow, 300ms. Tailwind's `hover:` variant is itself already scoped to
// hover-capable pointers (@media (hover:hover)); `motion-safe:` handles
// prefers-reduced-motion on top of that.
const CARD_HOVER = "transition-[transform,box-shadow] duration-300 motion-safe:hover:-translate-y-[3px] hover:shadow-md";

// Shared floor for the bottom row's 3 cards (Skills Overview, Top Skill
// Domains, Pending Approvals) — used 3 times, one constant so it stays in sync.
const CARD_MIN_HEIGHT = "min-h-48";

// ── Donut chart helpers ──
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSegmentPath(cx, cy, outerR, innerR, startAngle, endAngle) {
  const sweep = endAngle - startAngle;
  if (sweep >= 360) {
    const mid = startAngle + 180;
    const p1 = polarToCartesian(cx, cy, outerR, startAngle);
    const p2 = polarToCartesian(cx, cy, outerR, mid);
    const p3 = polarToCartesian(cx, cy, innerR, startAngle);
    const p4 = polarToCartesian(cx, cy, innerR, mid);
    return `M ${p1.x} ${p1.y} A ${outerR} ${outerR} 0 1 1 ${p2.x} ${p2.y} A ${outerR} ${outerR} 0 1 1 ${p1.x} ${p1.y} M ${p3.x} ${p3.y} A ${innerR} ${innerR} 0 1 0 ${p4.x} ${p4.y} A ${innerR} ${innerR} 0 1 0 ${p3.x} ${p3.y}`;
  }
  const os = polarToCartesian(cx, cy, outerR, startAngle);
  const oe = polarToCartesian(cx, cy, outerR, endAngle);
  const is_ = polarToCartesian(cx, cy, innerR, startAngle);
  const ie = polarToCartesian(cx, cy, innerR, endAngle);
  const large = sweep > 180 ? 1 : 0;
  return `M ${os.x} ${os.y} A ${outerR} ${outerR} 0 ${large} 1 ${oe.x} ${oe.y} L ${ie.x} ${ie.y} A ${innerR} ${innerR} 0 ${large} 0 ${is_.x} ${is_.y} Z`;
}

const MEDAL_COLORS = ["text-amber-500", "text-gray-400 dark:text-gray-500", "text-orange-400"];

// Maps this card's 4 HOME_PROGRESS_BUCKET_CONFIG rows (the real
// training_status_enum values) onto My Trainings' 4 STATUS_BUCKET_CONFIG
// tabs (see EmployeeTrainingPanel.jsx) — there's no dedicated tab for "Not
// Completed", so it lands on Not Started, exactly where getBucketForStatus
// already folds that same real status today.
const HOME_PROGRESS_TO_PANEL_BUCKET = {
  completed: "completed",
  inProgress: "inProgress",
  notStarted: "notStarted",
  notCompleted: "notStarted",
};

/**
 * Employee self-view dashboard.
 *
 * Props:
 *   stats            — computed employee stats
 *   trainings        — array of training objects
 *   displayName      — employee's first name
 *   homeViewMode     — "self" | "manager"
 *   setHomeViewMode  — setter
 *   isManager        — boolean, is this employee an org-chart manager (has direct reports)
 *   canViewOrgWide   — boolean, Admin-only. The Self/Manager toggle below shows for either
 *                       isManager OR canViewOrgWide — so a non-manager Admin can still
 *                       reach Manager Dashboard (they land on its "Entire Organization"
 *                       scope-pill option, since Direct Reports/Entire Team would be
 *                       empty for them)
 *   onOpenSkillsPanel — callback to open the skills panel (handled in HomeScreen)
 *   onOpenCertsPanel  — callback to open the certs panel (handled in HomeScreen)
 *   onOpenTrainingsPanel — (bucket, year, openCatalog?) => void, opens the full Trainings panel (handled in HomeScreen)
 */
export default function SelfDashboard({
  stats,
  trainings,
  displayName,
  homeViewMode,
  setHomeViewMode,
  isManager,
  canViewOrgWide,
  onOpenSkillsPanel,
  onOpenCertsPanel,
  onOpenTrainingsPanel,
}) {
  const { setActiveTab } = useSkillMatrixNav();
  const { user } = useAuth();
  const { actionableRequests: teamRequests, orgWideView } = useManagerApprovals(); // direct reports' pending nominations (org-wide tree isn't "yours")
  const goToTrainingBatches = useGoToTrainingBatches();
  const isMobile = useIsMobile();
  const [showAllDomains, setShowAllDomains] = useState(false);
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);

  // Small, self-contained fetch — deliberately NOT threaded through
  // HomeScreen.jsx's own already-elaborate hierarchy/skills/certs
  // load-and-cache effect (per-field sessionStorage flags, retry/fallback
  // branches for each). Batches are a distinct, low-stakes, read-only list
  // this card alone needs to compute one badge count — adding a fifth
  // moving part to that existing orchestration for that would be a lot of
  // risk for a small addition. `trainings` (this employee's own, for the
  // "already requested" exclusion) is already a prop HomeScreen fetched
  // for everything else this card shows.
  //
  // Fetched once on mount — this component remounts whenever the user
  // navigates back to the Home tab (see HomeScreen.jsx's own comment), so
  // an admin opening a new batch for enrollment elsewhere still shows up
  // here on the next visit without needing a background poll.
  const [openEnrollmentBatches, setOpenEnrollmentBatches] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetchBatches()
      .then((res) => { if (!cancelled) setOpenEnrollmentBatches(res.results || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const openEnrollmentCount = useMemo(
    () => countOpenEnrollmentBatches(openEnrollmentBatches),
    [openEnrollmentBatches]
  );

  // Open Batches card (row 2, between Quick Actions and Training Progress) —
  // reuses the same openEnrollmentBatches fetched above, plus this
  // employee's own trainings (already a prop). Returns both a "Not Applied"
  // list (default) and an "All" list (its own in-card toggle switches
  // between them) — see openBatchesAdapter.js. Clicking a row deep-links
  // into the open-enrollment catalog, pre-searched to that batch, same
  // pattern the Pending Approvals items below already use for a
  // specific-record deep link.
  const {
    unrequestedItems: openBatchesUnrequestedItems,
    totalOpenCount: openBatchesTotalCount,
  } = useOpenBatchesCard({ batches: openEnrollmentBatches, myTrainings: trainings });
  const handleOpenBatchClick = (item) => onOpenTrainingsPanel?.(null, null, true, item.name);

  const yearOptions = useMemo(() => {
    const years = new Set([CURRENT_YEAR, ...getAvailableYears(trainings)]);
    return [...years].sort((a, b) => b - a);
  }, [trainings]);

  const yearFilteredTrainings = useMemo(
    () => filterTrainingsByYear(trainings, selectedYear),
    [trainings, selectedYear]
  );

  // The Training Progress breakdown (see HOME_PROGRESS_BUCKET_CONFIG) —
  // respects this card's own year filter, same as the old chip row did.
  const homeProgressBuckets = useMemo(() => bucketHomeProgressTrainings(yearFilteredTrainings), [yearFilteredTrainings]);

  // Status list handed to TrainingProgressCard as data, not a hardcoded
  // row count — however many entries HOME_PROGRESS_BUCKET_CONFIG has
  // (today 6, 4 once the two folded statuses are retired) is exactly how
  // many rows the card renders.
  const trainingProgressStatuses = useMemo(
    () => HOME_PROGRESS_BUCKET_CONFIG.map((bucket) => ({
      ...bucket,
      count: (homeProgressBuckets[bucket.key] || []).length,
    })),
    [homeProgressBuckets]
  );

  // This employee's OWN training nominations still awaiting their
  // manager's decision. Checked live against GET add_training_v2 (not
  // assumed from docs — an earlier "nominated" guess, based on a stale
  // module comment elsewhere, matched zero real records): the raw,
  // live training_status value IS the literal string "Pending Approval",
  // not an unfolded "Nominated" enum needing a display-label override.
  // `.includes("pending")` (not a strict equality check) so this also
  // catches "pending approval" regardless of any future casing/wording
  // drift, the same defensive match StatusPill's own pending-dot-pulse
  // logic already uses. The "Pending Approvals" card below used to only
  // ever show something for a MANAGER (their reports' pending skill
  // requests, via the `pendingRequests` prop) — a plain employee saw "All
  // caught up!" permanently, even mid-nomination, since nothing populated
  // that card for them at all. Reuses `trainings` (already fetched for
  // Training Progress above) — no new API call.
  const myPendingTrainings = useMemo(
    () => trainings.filter((t) => getTrainingStatus(t).toLowerCase().includes("pending")),
    [trainings]
  );

  // One shared shape for both sources so the render loop below doesn't
  // need an if/else per item: direct reports' training nominations a MANAGER
  // needs to review (from ManagerApprovalsContext) come first (they
  // need someone else's action, the more time-sensitive of the two), then
  // this employee's OWN pending training requests — visually distinguished
  // by icon (FiSend "waiting" vs FiInbox "needs review") and by
  // label ("YOUR REQUEST" vs "YOUR DECISION"), not by a
  // different card/section, so a manager who ALSO has their own pending
  // requests sees one combined, still-scannable list instead of two
  // separate widgets for what's ultimately the same "waiting on a
  // decision" concept.
  const pendingApprovalItems = useMemo(() => {
    const teamItems = (orgWideView ? [] : teamRequests).map((req) => ({ // your own nominations appear here only if you are your own manager
      ...DECISION_ITEM,
      key: `team-${req.id}`,
      name: req.moduleName,
      subtitle: `Requested by ${req.employeeName}`,
      date: req.requestedAt,
      onClick: () => goToTrainingBatches({ scope: BATCH_SCOPE.PENDING_APPROVALS, batchNums: [req.batchNum], label: `Pending approvals · ${req.batchNum}` }, BATCH_VIEW_ORIGIN.MANAGER_DASHBOARD), // this batch's pending approvals; crumb: Home > Manager Dashboard
    }));
    const requestSubtitle = user?.managerEmail ? (user.managerEmail.toLowerCase() === (user.mail || user.userPrincipalName)?.toLowerCase() ? "Sent to you for approval" : `Sent to your manager (${user.managerEmail})`) : ""; // same for every own request
    const trainingItems = myPendingTrainings.map((t) => {
      const name = t.moduleName || t.module_name || t.module || "Training";
      return {
        key: `training-${t.id ?? t.employeeTrainingId ?? t.employee_training_id ?? name}`,
        name,
        ...REQUEST_ITEM,
        subtitle: requestSubtitle,
        date: t.createdAt || t.created_at || null, // same field team rows use (pendingRequests.js)
        // Deep-links straight to THIS record (via My Trainings' own search,
        // seeded with the module name — see EmployeeTrainingPanel.jsx's
        // `initialSearch`) instead of just the generic "All" view, which
        // used to leave the user to hunt for the one card they clicked for
        // among everything else on the page.
        onClick: () => onOpenTrainingsPanel?.(null, null, false, name),
      };
    });
    return [...teamItems.sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))), ...trainingItems]; // newest first (ISO dates); API already sends trainings newest first
  }, [teamRequests, orgWideView, myPendingTrainings, user?.managerEmail, user?.mail, user?.userPrincipalName, onOpenTrainingsPanel, goToTrainingBatches]);
  const approvalGroups = [ // header "view all" buttons, one per row type
    { key: REQUEST_ITEM.ownership, label: "My nominations", onViewAll: () => onOpenTrainingsPanel?.("pendingApproval", selectedYear) },
    { key: DECISION_ITEM.ownership, label: "Team nominations", isDefault: true, onViewAll: () => goToTrainingBatches({ scope: BATCH_SCOPE.PENDING_APPROVALS }, BATCH_VIEW_ORIGIN.MANAGER_DASHBOARD) },
  ];
  const showsBothApprovalGroups = approvalGroups.every((g) => pendingApprovalItems.some((item) => item.ownership === g.key));

  // ── Donut chart data ──
  const l1 = stats.skillsByLevel.L1;
  const l2 = stats.skillsByLevel.L2;
  const l3 = stats.skillsByLevel.L3;
  const donutTotal = l1 + l2 + l3 || 1;
  const GAP = donutTotal > 1 ? 3 : 0;
  const CX = 50, CY = 50, OUTER_R = 38, INNER_R = 26;

  const levelSegments = [
    { key: "L1", count: l1, color: "#3b82f6", darkColor: "#60a5fa" },
    { key: "L2", count: l2, color: "#22c55e", darkColor: "#4ade80" },
    { key: "L3", count: l3, color: "#a855f7", darkColor: "#c084fc" },
  ];

  let currentAngle = -90;
  const donutPaths = levelSegments.map((seg) => {
    const portion = seg.count / donutTotal;
    const sweep = portion * 360 - (seg.count > 0 ? GAP : 0);
    const start = currentAngle + (seg.count > 0 ? GAP / 2 : 0);
    const end = start + Math.max(sweep, 0);
    currentAngle += portion * 360;
    return { ...seg, path: seg.count > 0 ? donutSegmentPath(CX, CY, OUTER_R, INNER_R, start, end) : null };
  });

  const dominantSeg = levelSegments.reduce((a, b) => (b.count > a.count ? b : a), levelSegments[0]);

  const allDomains = Object.entries(stats.skillsByDomain).sort(([, a], [, b]) => b - a);

  const quickActions = [
    // First on purpose (when present), not appended at the end — a newly
    // open batch is time-sensitive the way "Add Skills"/"My Profile" below
    // never are, so it gets the highest-attention slot in the grid instead
    // of competing equally with three evergreen actions.
    //
    // Visible whenever any batch is currently Open, not only when a newly-
    // opened one exists. Reopening an older batch updates `updated_at`,
    // but the user's mental model is simpler and correct: if it is Open
    // now, Home should offer the nomination entry point now. `badge` is
    // openEnrollmentCount (every open batch, same total
    // EmployeeTrainingPanel.jsx's own bell shows — see its comment on why
    // that's a deliberately different number from a "new" count) — the
    // subtitle stays a plain description, like every sibling action's own
    // subtitle, not a second restatement of the badge's number.
    {
      label: "Nominate for Training",
      // Was "N open, N new" — dropped on request: the corner badge already
      // shows that same count, so the subtitle was restating it a second
      // time on one small card. A plain description matches every sibling
      // action's own subtitle (a description, never a number).
      sub: "View open batches",
      icon: <FiStar className="h-3.5 w-3.5 text-indigo-500" />,
      bg: "bg-indigo-50 dark:bg-indigo-900/20",
      hover: "hover:border-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40",
      action: () => onOpenTrainingsPanel?.(null, null, true),
      badge: openEnrollmentCount,
      badgePulse: true,
      hidden: openEnrollmentCount === 0,
    },
    { label: "Add Skills", sub: "Update profile", icon: <FiPlusCircle className="h-3.5 w-3.5 text-blue-500" />, bg: "bg-blue-50 dark:bg-blue-900/20", hover: "hover:border-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40", action: onOpenSkillsPanel },
    { label: "Upload Certificate", sub: "Add certification", icon: <FiUpload className="h-3.5 w-3.5 text-green-500" />, bg: "bg-green-50 dark:bg-green-900/20", hover: "hover:border-green-300 hover:bg-green-100 dark:hover:bg-green-900/40", action: onOpenCertsPanel },
    { label: "View Graph", sub: "Explore hierarchy", icon: <FiTrendingUp className="h-3.5 w-3.5 text-purple-500" />, bg: "bg-purple-50 dark:bg-purple-900/20", hover: "hover:border-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40", action: () => setActiveTab("graph"), hideOnMobile: true },
    { label: "My Profile", sub: "View details", icon: <FiUser className="h-3.5 w-3.5 text-amber-500" />, bg: "bg-amber-50 dark:bg-amber-900/20", hover: "hover:border-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40", action: () => setActiveTab("profile") },
  ];

  return (
    <div className="h-full flex flex-col gap-1.5 p-2.5 text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900">

      {/* Header */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Dashboard</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Welcome back, {displayName}.
            {stats.daysSinceUpdate !== null && stats.daysSinceUpdate >= 0 && (
              <> • Last updated -{" "}
                {stats.daysSinceUpdate === 0 ? "today" : stats.daysSinceUpdate === 1 ? "yesterday" : `${stats.daysSinceUpdate} days ago`}
              </>
            )}
          </p>
        </div>
        {/* canViewOrgWide also unlocks this toggle for a non-manager Admin —
            "Entire Organization" now lives as a 3rd scope-pill option
            inside Manager Dashboard itself (next to Direct Reports/Entire
            Team), not as a second switch here; this is just how such an
            Admin REACHES that page in the first place. */}
        {(isManager || canViewOrgWide) && <SelfManagerToggle value={homeViewMode} onChange={setHomeViewMode} />}
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
        <button onClick={() => setActiveTab("skills")} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-3 py-2 flex items-center gap-2.5 hover:shadow-md hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer transition-all text-left">
          <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
            <FiList className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Skills</p>
            <p className="text-base font-bold text-gray-900 dark:text-white leading-tight line-clamp-2">{stats.totalSkills}</p>
          </div>
        </button>

        <button onClick={() => setActiveTab("certs")} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-3 py-2 flex items-center gap-2.5 hover:shadow-md hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer transition-all text-left">
          <div className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
            <FiAward className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Certificates</p>
            <p className="text-base font-bold text-gray-900 dark:text-white leading-tight line-clamp-2">{stats.totalCertificates}</p>
          </div>
        </button>

        {/* Was setActiveTab("profile") — a real, pre-existing bug: this card
            shows a training count but navigated to the Profile tab, not My
            Trainings. Fixed to reuse the exact same navigation Training
            Progress's own "View All" already uses (onOpenTrainingsPanel),
            not a new route. ALL_YEARS, not `selectedYear` — this KPI is an
            all-time total (matches its Skills/Certificates siblings, which
            have no year concept either), so landing anywhere year-filtered
            would show a smaller number than the "10" just clicked; passing
            `null` for year looks like "no filter" but isn't — the panel's
            own initial-state fallback (`initialYear ?? persisted ??
            CURRENT_YEAR`) treats null as "not specified" and defaults to
            the current year regardless, same mismatch risk. */}
        <button onClick={() => onOpenTrainingsPanel?.(null, ALL_YEARS)} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-3 py-2 flex items-center gap-2.5 hover:shadow-md hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer transition-all text-left">
          <div className="w-6 h-6 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center shrink-0">
            <FiBook className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Trainings</p>
            <p className="text-base font-bold text-gray-900 dark:text-white leading-tight line-clamp-2">{stats.completedTrainings} / {stats.totalTrainings}</p>
          </div>
        </button>

        <button onClick={() => setActiveTab("skills")} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-3 py-2 flex items-center gap-2.5 hover:shadow-md hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer transition-all text-left">
          <div className="w-6 h-6 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
            <FiCheckCircle className="h-3.5 w-3.5 text-green-500 dark:text-green-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">L1/L2/L3</p>
            <p className="text-base font-bold text-gray-900 dark:text-white leading-tight line-clamp-2">{l1}/{l2}/{l3}</p>
          </div>
        </button>
      </div>

      {/* Quick Actions + Open Batches + Training Progress — swapped with
          Pending Approvals (2026-08-21): Pending Approvals is empty far more
          often than not (a normal employee has no reports to approve most
          of the time), which left this WIDE half-page slot mostly showing a
          small centered "All caught up!" message surrounded by dead space
          next to Quick Actions' denser 2x3 button grid. Training Progress
          — always has 4 status rows + a year filter + View All, genuinely
          benefiting from the wider slot — moved up here instead; Pending
          Approvals moved down to the narrower 3-column row below, where an
          occasional-content card reads as normal-density rather than
          conspicuously empty. Open Batches (added later, same row) uses the
          same grid-cols-1 sm:grid-cols-2 md:grid-cols-3 progression as the
          3-card row below, for a consistent breakpoint vocabulary. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 items-stretch gap-2 shrink-0">
        <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-2.5 h-full flex flex-col cursor-default ${CARD_HOVER}`}>
          <h2 className="text-xs font-semibold text-gray-900 dark:text-white mb-1.5">Quick Actions</h2>
          {(() => {
            // F-pattern scanning (NN/g): the highest-priority action sits
            // top-left as its own full-width "hero" row, visually
            // distinguished (tint + larger tap area) as the single
            // high-emphasis CTA — everything else is deliberately lower
            // emphasis (Material/Carbon card-action guidance: one primary
            // action, the rest secondary). Secondary tiles use flex-wrap
            // with a FIXED basis (not flex-grow) instead of a CSS grid: a
            // grid needs col-span hacks to avoid a leftover "orphan" tile
            // stretching to fill its row when the count is odd (3 on
            // mobile once View Graph hides); a fixed-basis flex row just
            // wraps that same tile to its own line at its normal width,
            // leaving ordinary trailing whitespace beside it instead of an
            // oversized dead-space button — the standard fix for orphaned
            // grid items. Works for any action count without touching this
            // layout code (OCP) — no per-count lookup table needed.
            const [heroAction, ...restActions] = quickActions;
            const showHero = heroAction && !heroAction.hidden;
            const secondaryActions = restActions.filter(item => !item.hidden && !(item.hideOnMobile && isMobile));
            return (
              <>
                {showHero && (
                  <button
                    onClick={heroAction.action}
                    className={`relative w-full flex items-center gap-2 p-2 mb-1 rounded-lg border border-indigo-100 dark:border-indigo-800/40 bg-indigo-50/60 dark:bg-indigo-900/10 ${heroAction.hover} cursor-pointer transition-colors duration-200 text-left`}
                  >
                    {heroAction.badge != null && (
                      <span className="absolute -top-1 -right-1 flex">
                        {heroAction.badgePulse && (
                          <span className="motion-safe:animate-ping absolute inset-0 rounded-full bg-rose-300 opacity-50" aria-hidden="true" />
                        )}
                        <span className="relative min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                          {heroAction.badge}
                        </span>
                      </span>
                    )}
                    <div className={`w-6 h-6 rounded-md ${heroAction.bg} flex items-center justify-center shrink-0`}>{heroAction.icon}</div>
                    <div>
                      <p className="text-[11px] font-semibold text-gray-900 dark:text-white leading-tight">{heroAction.label}</p>
                      <p className="text-[9px] text-gray-400 dark:text-gray-500">{heroAction.sub}</p>
                    </div>
                  </button>
                )}
                <div className="flex-1 flex flex-wrap content-center gap-1 overflow-x-hidden">
                  {secondaryActions.map(({ label, sub, icon, bg, hover, action }) => (
                    <button
                      key={label}
                      onClick={action}
                      className={`flex-none basis-[calc(50%-2px)] min-w-0 flex items-center gap-2 p-1.5 rounded-lg border border-gray-100 dark:border-gray-700 ${hover} cursor-pointer transition-colors duration-200 text-left`}
                    >
                      <div className={`w-6 h-6 rounded-md ${bg} flex items-center justify-center shrink-0`}>{icon}</div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-gray-900 dark:text-white leading-tight truncate">{label}</p>
                        <p className="text-[9px] text-gray-400 dark:text-gray-500 truncate">{sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            );
          })()}
        </div>

        {/* Open Batches — only batches this employee hasn't requested yet
            (prompts a NEW nomination; already-applied/completed batches are
            filtered out — see openBatchesAdapter.js). Data/derivation is
            fully reused (see useOpenBatchesCard.js), this component only
            renders. */}
        <OpenBatchesCard
          unrequestedItems={openBatchesUnrequestedItems}
          totalOpenCount={openBatchesTotalCount}
          onItemClick={handleOpenBatchClick}
          onViewAll={() => onOpenTrainingsPanel?.(null, null, true)}
        />

        {/* Training Progress — status list is data-driven (see
            trainingProgressStatuses above), not a fixed row count. Every
            click opens the in-page My Trainings panel
            (onOpenTrainingsPanel -> EmployeeTrainingPanel), landed on the
            closest matching status tab — NOT the Training Batch admin
            page; that redirect is for Manager-side surfaces only
            (leaderboard rows, Team Alerts), never for an employee's own
            Home Screen. HOME_PROGRESS_TO_PANEL_BUCKET maps this card's
            rows onto My Trainings' 4 tabs (Pending Approval and Cancelled
            have no dedicated tab there, so both fold into "Not Started",
            where their real status still shows correctly via each card's
            own StatusPill). No sm:col-span-2/md:col-span-1 needed here —
            this row is always 3 equal columns at md+ (2 at sm, 1 on
            mobile), so each card naturally takes its own slot without any
            conditional spanning. */}
        <TrainingProgressCard
          statuses={trainingProgressStatuses}
          years={yearOptions}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          onViewAll={() => onOpenTrainingsPanel?.("assigned", selectedYear)} // always opens on the "All" tab
          onSelectStatus={(key) => onOpenTrainingsPanel?.(HOME_PROGRESS_TO_PANEL_BUCKET[key], selectedYear)}
        />
      </div>

      {/* Bottom row: Skills Overview | Top Domains | Pending Approvals */}
      {/* No lg:flex-1 here on purpose — that used to make this row (and
          every card in it) stretch to fill 100% of whatever vertical space
          was left in the page, which looked fine on a short viewport but
          left large dead space inside each card on a normal/tall one. Each
          card now just takes its own natural content height everywhere;
          the page-level overflow-y-auto (see the outer container above)
          is the only fallback needed if that's ever taller than the
          viewport. */}
      {/* md: not lg: — at a width between those two (e.g. ~845px, easily
          reached with devtools open, or a smaller/split-screen laptop
          window), lg:grid-cols-3 wouldn't be active yet, sm:grid-cols-2
          would still be, and Pending Approvals' sm:col-span-2 (below) would
          make it span BOTH columns on its own second row below the other
          two — not 3 cards in one row, but 2 stacked rows adding their
          heights together. Verified live (when this same span behavior sat
          on Training Progress, before the 2026-08-21 swap above): at 845px
          wide this measured 384px total (176 + 8px gap + 200) instead of
          the ~200px a single row needs. */}
      {/* lg/xl: extra columns so Training approval activity (2 of 4, then a 1 : 1 : 2.4 ratio) fits its title, toggle and buttons on one row; it takes more width from Top Skill Domains only when both groups (toggle + 2 chips) show. */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 ${showsBothApprovalGroups ? "xl:grid-cols-[1fr_0.75fr_2.65fr]" : "xl:grid-cols-[1fr_1fr_2.4fr]"} items-stretch gap-2 motion-safe:transition-[grid-template-columns] duration-300`}>

        {/* Skills Overview — donut chart */}
        <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-2.5 h-full flex flex-col overflow-hidden ${CARD_MIN_HEIGHT} cursor-default ${CARD_HOVER}`}>
          <h2 className="text-xs font-semibold text-gray-900 dark:text-white mb-1.5 shrink-0">Skills Overview</h2>
          <div className="flex items-center gap-4 flex-1 min-h-0">
            <div className="relative shrink-0">
              <svg width="100" height="100" viewBox="0 0 100 100">
                <circle cx={CX} cy={CY} r={(OUTER_R + INNER_R) / 2} fill="none" stroke="#f1f5f9" strokeWidth={OUTER_R - INNER_R} className="dark:stroke-gray-700" />
                {donutPaths.map((seg) =>
                  seg.path ? <path key={seg.key} d={seg.path} fill={seg.color} /> : null
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">
                  {dominantSeg.key}: {dominantSeg.count}
                </span>
                <span className="text-[9px] text-gray-400 dark:text-gray-500">
                  Level {dominantSeg.key.replace("L", "")}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              {levelSegments.map((seg) => (
                <div key={seg.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                    <span className="text-xs text-gray-800 dark:text-gray-200">{seg.key}</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-900 dark:text-white">{seg.count}</span>
                </div>
              ))}
              <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
                <span className="text-[10px] text-gray-400">
                  {levelSegments.map((s) => s.key).filter((k) => stats.skillsByLevel[k] > 0).join(" • ")}
                  {" "}{l1 + l2 + l3 > 0 ? l1 + l2 + l3 : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Skill Domains */}
        <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-2.5 h-full flex flex-col overflow-hidden ${CARD_MIN_HEIGHT} cursor-default ${CARD_HOVER}`}>
          <div className="flex items-center justify-between mb-1.5 shrink-0">
            <h2 className="text-xs font-semibold text-gray-900 dark:text-white">Top Skill Domains</h2>
            {allDomains.length > 4 && (
              <ViewAllLink onClick={() => setShowAllDomains(v => !v)} expanded={showAllDomains}>
                {showAllDomains ? "Show less" : "View All"}
              </ViewAllLink>
            )}
          </div>
          {/* Visible scrollbar (not hidden), same as TrainingProgressCard.jsx —
              a short viewport can shrink this below its content, and a
              hidden scrollbar would clip domains with no sign there's more. */}
          <div className="space-y-0.5 overflow-y-auto overflow-x-hidden flex-1">
            {allDomains.length > 0
              ? (showAllDomains ? allDomains : allDomains.slice(0, 4)).map(([domain, count], idx) => (
                <div key={domain} className="flex items-center justify-between py-1 px-1.5 rounded-lg border-l-[3px] border-l-transparent hover:border-l-blue-300 dark:hover:border-l-blue-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors duration-200">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {idx < 3
                      ? <FiAward className={`h-3.5 w-3.5 shrink-0 ${MEDAL_COLORS[idx]}`} />
                      : <span className="text-[10px] font-semibold text-gray-300 dark:text-gray-600 w-3.5 text-center shrink-0">{idx + 1}</span>
                    }
                    <span className="text-xs text-gray-800 dark:text-gray-200 truncate">{domain}</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-900 dark:text-white ml-2 shrink-0">{count}</span>
                </div>
              ))
              : <p className="text-xs text-gray-400 text-center py-4">No domains available</p>
            }
          </div>
        </div>

        {/* Same responsive span Training Progress used in this slot: full
            width at sm (avoids an awkward half-slot), 1 of 3 at md+. */}
        <PendingApprovalsCard
          items={pendingApprovalItems}
          groups={approvalGroups}
          className={`sm:col-span-2 md:col-span-1 lg:col-span-2 xl:col-span-1 ${CARD_MIN_HEIGHT}`}
        />

      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronDown, FiChevronRight, FiUsers } from "react-icons/fi";
import EmployeeDrillPeek from "./EmployeeDrillPeek";
import NotCompletedPreview from "./NotCompletedPreview";
import NotCompletedPill from "../../shared/components/NotCompletedPill";
import StatBadge from "../../shared/components/StatBadge";
import DetailList from "../../shared/components/DetailList";
import DetailListItem from "../../shared/components/DetailListItem";
import { countTeamStatusBuckets } from "../../shared/config/trainingStatusBuckets";
import { getNotCompletedTrainings, normalizeTrainingRecord } from "../../shared/config/trainingRecordAdapter";
import { normalizeCertRecord } from "../../shared/config/certRecordAdapter";
import { flattenSkillArray } from "../../shared/config/skillArrayAdapter";
import { useDelayedDisclosure } from "../../../../hooks/useDelayedDisclosure";
import { FOCUS_RING } from "../../shared/config/focusRing";
import HighlightMatch from "../../shared/components/HighlightMatch";
// Shared "press" feedback across every clickable control in this row — the
// one state that was previously missing: hover and focus existed, but
// nothing signalled "this registered your click" in the gap between press
// and its result (expand animation / popover appearing), which matters most
// on trackpads/touch where hover never fires at all.
const PRESS_CLASS = "active:scale-[0.98] transition-transform";
// Module-scope, not recomputed per row per render — a session/device's hover
// capability doesn't change mid-render, so every row re-reading this via
// window.matchMedia() on every render was pure waste on a list that can have
// 50+ rows.
const CAN_HOVER = typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;

/**
 * One employee summary row in the Manager Dashboard team list.
 *
 * A row can carry up to three independent interactive zones, and the
 * layout's whole job is making that obvious without looking like three
 * unrelated widgets glued together:
 *
 * 1. Expand control (chevron + name, merged into ONE button) — every row
 *    has this. It's a single honest click target: earlier this was two
 *    separate buttons (name and a trailing chevron) that did the exact
 *    same thing, which read as "two things" when it was one. Non-drillable
 *    rows: this expands/collapses the person's own training records inline
 *    — clicking the name IS "show this employee's details," there's no
 *    separate profile view. Drillable rows: the chevron here still expands
 *    the manager's OWN records (distinct from "View team" below), so it
 *    stays a second, separate button there — see (2).
 * 2. "View team" (drillable managers only, i.e. `isManager && reportCount >
 *    0`) — navigates to that person's team. Different destination class
 *    (leaves this list) from (1) (stays, reveals more inline), so it gets
 *    a different color language (indigo, chevron-right/"leads elsewhere")
 *    instead of the expand control's neutral gray chevron-down, PLUS a
 *    persistent (not hover-only) left accent bar so drillable rows read as
 *    "leads elsewhere" from a static glance, not just on mouseover.
 * 3. Not-Completed pill — a real second action (opens a reasons popover),
 *    rendered as a bordered, orange-hover chip that performs a click action
 *    (`interactive` NotCompletedPill), unlike the Skills/Certificates/
 *    Assigned trio beside it — those three are purely informational
 *    hover/focus triggers (StatBadge/Tooltip, neutral gray tint,
 *    `cursor-help`, no click handler), so the pill still needs its own
 *    distinct color/press language to read as "this one's a button."
 *    Deliberately NOT nested inside the expand button (interactive controls
 *    can't nest) — a true sibling.
 *
 * Skills/Certificates/Assigned all now open the same rich `DetailList`
 * hover panel (real items, not a one-line summary — see each badge's own
 * `useMemo` comment below for why each list was trimmed to just name + one
 * descriptor field rather than the fuller detail Not-Completed's own
 * preview shows).
 */
export default function EmployeeRow({
  employee,
  isExpanded = false,
  onToggleExpand,
  onDrillInto,
  drillingEnabled = false,
  notCompletedPopoverOpen = false,
  onToggleNotCompletedPopover,
  searchQuery = "",
}) {
  const { id, name, role, reportCount, isManager } = employee;
  const isDrillable = drillingEnabled && isManager && reportCount > 0;
  const skillCount = employee.skillCount ?? 0;
  const certCount = employee.certifications?.length ?? 0;
  // Flattened from the raw hierarchy tree (domain → discipline → skillArea
  // → framework) rather than read off `employee.skillLevelBreakdown` — that
  // field only ever carried the L1/L2/L3 counts (still used by
  // computeStatsFromTeam elsewhere), not the actual skill names this hover
  // panel needs to show. useMemo for the same reason as statusCounts below:
  // recomputes on every row re-render otherwise (list can have 50+ rows).
  const skillItems = useMemo(
    () => (skillCount > 0 ? flattenSkillArray(employee.rawNode?.skills?.skillArray) : []),
    [skillCount, employee.rawNode]
  );
  // Deliberately just name + level — no domain/discipline/skill-area path.
  // A manager scanning this on hover wants "does this person know X, and how
  // well," not a taxonomy lesson; the full path is still one click away in
  // the employee's own skill records if ever needed.
  const skillDetail = useMemo(
    () =>
      skillItems.length > 0 ? (
        <DetailList
          title={`Skills (${skillItems.length})`}
          items={skillItems}
          renderItem={(item) => <DetailListItem name={item.name} description={`${item.level} ${item.levelLabel}`} />}
        />
      ) : undefined,
    [skillItems]
  );
  // Same restraint as Skills above: name + provider/level only. No status
  // pill (Valid/Expiring Soon/Expired) here — that's a real, actionable
  // signal on the certification's own detail view, but noisy for a quick
  // hover scan of "what does this person hold."
  const certDetail = useMemo(
    () =>
      certCount > 0 ? (
        <DetailList
          title={`Certificates (${certCount})`}
          items={employee.certifications.map((c) => normalizeCertRecord(c))}
          renderItem={(cert) => (
            <DetailListItem name={cert.certName} description={[cert.certProvider, cert.certLevel].filter(Boolean).join(" · ") || undefined} />
          )}
        />
      ) : undefined,
    [certCount, employee.certifications]
  );
  // Full 5-real-status breakdown — derived locally from the raw trainings
  // array already threaded onto `employee` for EmployeeExpandedRecords
  // below, so no new data fetch/prop plumbing. useMemo since this
  // recomputes on every row re-render otherwise (list can have 50+ rows).
  const statusCounts = useMemo(() => countTeamStatusBuckets(employee.trainings), [employee.trainings]);
  const assignedCount = employee.trainings?.length ?? 0;
  const notCompletedCount = statusCounts.notCompleted;
  // Same restraint as Skills/Certificates above: name + status only, one
  // row per assigned training — replaces the old "3 completed · 2 in
  // progress · 9 not started" aggregate summary with the actual list, same
  // way those two badges now show real items instead of just counts. Still
  // deliberately plain (no icon/pill) for a quick hover scan; anyone
  // needing the specific reason a Not Completed one failed already has the
  // dedicated pill right beside this badge for that.
  const assignedDetail = useMemo(
    () =>
      assignedCount > 0 ? (
        <DetailList
          title={`Assigned (${assignedCount})`}
          items={(employee.trainings || []).map((t) => normalizeTrainingRecord(t))}
          renderItem={(t) => <DetailListItem name={t.moduleName} description={t.trainingStatus} />}
        />
      ) : undefined,
    [assignedCount, employee.trainings]
  );
  // Normalized (moduleName/statusRemarks/reviewedByName/reviewedAt as
  // guaranteed keys — see trainingRecordAdapter.jsx) only for the subset
  // the tooltip/popover actually need; the row's own raw `employee.trainings`
  // stays untouched for EmployeeExpandedRecords.
  const notCompletedTrainings = useMemo(
    () => getNotCompletedTrainings(employee.trainings),
    [employee.trainings]
  );
  const rowRef = useRef(null);
  const notCompletedBtnRef = useRef(null);
  const [peekOpen, setPeekOpen] = useState(false);
  const showTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const peekId = `employee-drill-peek-${id}`;
  // pinned = opened via click (persists regardless of mouse position);
  // notCompletedTooltip.open = the delayed hover/focus preview. Both drive
  // the SAME NotCompletedPreview panel below — see its own doc comment for
  // why this collapsed from two separate components into one.
  const pinned = notCompletedPopoverOpen;
  const notCompletedTooltip = useDelayedDisclosure();

  const pinNotCompletedPreview = () => {
    onToggleNotCompletedPopover?.(id);
  };
  const closeNotCompletedPreview = () => {
    notCompletedTooltip.hideNow();
    onToggleNotCompletedPopover?.(null);
  };

  const handleDrill = () => {
    if (isDrillable) onDrillInto?.(id, name);
  };

  // Hover-intent debounce (NN/G timing guidelines): a short pause before
  // showing distinguishes deliberate hovering from a cursor just passing
  // through while scanning down the list; a short pause before hiding
  // smooths out incidental jitter at the row's edge. Keyboard focus skips
  // both delays — a Tab press is already a deliberate, discrete action,
  // unlike continuous mouse movement.
  useEffect(() => () => {
    clearTimeout(showTimerRef.current);
    clearTimeout(hideTimerRef.current);
  }, []);
  const scheduleShow = () => {
    clearTimeout(hideTimerRef.current);
    showTimerRef.current = setTimeout(() => setPeekOpen(true), 300);
  };
  const scheduleHide = () => {
    clearTimeout(showTimerRef.current);
    hideTimerRef.current = setTimeout(() => setPeekOpen(false), 400);
  };

  return (
    <div
      ref={rowRef}
      className={`w-full flex items-center rounded-lg border shadow-sm transition-all ${
        isExpanded
          ? "border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/10"
          : isDrillable
          ? "border-gray-100 dark:border-gray-700 border-l-[3px] border-l-indigo-300 dark:border-l-indigo-700 bg-white dark:bg-gray-800 hover:shadow-md hover:border-l-indigo-400 dark:hover:border-l-indigo-600"
          : "border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800"
      }`}
      onMouseEnter={() => CAN_HOVER && isDrillable && scheduleShow()}
      onMouseLeave={() => CAN_HOVER && scheduleHide()}
    >
      {isDrillable ? (
        <>
          {/* "View team" — leads elsewhere, so it gets indigo (not the
              expand control's neutral gray) plus the row's own persistent
              left accent bar above; hover/focus only used to deepen an
              already-visible signal, not create it from nothing. */}
          <button
            type="button"
            onClick={handleDrill}
            onFocus={() => setPeekOpen(true)}
            onBlur={scheduleHide}
            aria-describedby={peekOpen ? peekId : undefined}
            className={`group min-w-0 flex-1 flex items-center gap-2.5 py-2 pl-3 pr-2.5 text-left cursor-pointer rounded-l-lg hover:bg-indigo-50/60 dark:hover:bg-indigo-900/10 active:bg-indigo-100/80 dark:active:bg-indigo-900/30 ${PRESS_CLASS} ${FOCUS_RING}`}
            aria-label={`Open ${name}'s team`}
          >
            <p className="min-w-0 flex-1 text-sm font-medium text-gray-900 dark:text-white truncate"><HighlightMatch text={name} query={searchQuery} /></p>
            {/* Same Skills/Certs/Assigned trio as the non-drillable row below
                — a drillable manager's own row previously showed the LEAST
                info of any row type (just reportCount), which is backwards
                since they're still an employee with their own records too. */}
            <StatBadge label="Skills" count={skillCount} detail={skillDetail} variant="panel" className="hidden xl:flex" />
            <StatBadge label="Certificates" count={certCount} detail={certDetail} variant="panel" className="hidden xl:flex" />
            <span className="hidden sm:inline-flex shrink-0 items-center gap-1 h-6 px-2 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-semibold">
              <FiUsers className="h-3 w-3" aria-hidden="true" />
              {reportCount}
            </span>
            <span className="hidden lg:inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
              View team
            </span>
            <FiChevronRight className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-400 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 group-hover:translate-x-0.5 transition-all" aria-hidden="true" />
          </button>

          <span aria-hidden="true" className="w-px self-stretch my-2.5 bg-gray-100 dark:bg-gray-700 shrink-0" />

          {/* Own-records expand — a genuinely different action from "View
              team" above (stays in place vs. navigates away), so it keeps
              the expand control's neutral gray language, not indigo. */}
          <button
            type="button"
            onClick={() => onToggleExpand?.(id)}
            aria-expanded={isExpanded}
            aria-controls={`employee-records-${id}`}
            aria-label={isExpanded ? `Hide ${name}'s own training records` : `Show ${name}'s own training records`}
            className={`shrink-0 flex items-center justify-center h-full py-2 px-2.5 cursor-pointer rounded-r-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 active:bg-gray-100 dark:active:bg-gray-700/60 ${PRESS_CLASS} ${FOCUS_RING}`}
            title={isExpanded ? "Hide training records" : "Show training records"}
          >
            <FiChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-180 text-blue-500 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"}`}
            />
          </button>
        </>
      ) : (
        <>
          {/* Expand control — chevron + name merged into ONE button
              (previously two separate buttons doing the identical action,
              which read as two things). Chevron leads the label — the
              disclosure-triangle-before-the-label convention (Finder,
              VS Code's file tree, Notion toggles) — so it's unambiguous
              this pair is one control, and it stays visually distinct from
              the drillable row's trailing, indigo "leads elsewhere"
              chevron above: different position, different direction,
              different color, for a genuinely different kind of action. */}
          <button
            type="button"
            onClick={() => onToggleExpand?.(id)}
            aria-expanded={isExpanded}
            aria-controls={`employee-records-${id}`}
            className={`group min-w-0 flex-1 flex items-center gap-2 py-2 pl-2.5 pr-2 text-left cursor-pointer rounded-l-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 active:bg-gray-100 dark:active:bg-gray-700/60 ${PRESS_CLASS} ${FOCUS_RING}`}
            title={isExpanded ? "Hide training records" : "Show training records"}
          >
            <FiChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${
                isExpanded ? "rotate-180 text-blue-500 dark:text-blue-400" : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300"
              }`}
              aria-hidden="true"
            />
            <p className="min-w-0 flex-1 text-sm font-medium text-gray-900 dark:text-white truncate"><HighlightMatch text={name} query={searchQuery} /></p>
          </button>

          <span aria-hidden="true" className="hidden sm:block w-px self-stretch my-2.5 bg-gray-100 dark:bg-gray-700 shrink-0" />

          {/* Assigned/Not Completed — replaces the old 5-chip
              StatusChipGroup breakdown. Assigned stays plain, unstyled text
              (Training Batch page has no equivalent — Enrollments is
              headcount for a batch, Assigned is training count for a
              person, different concepts) — deliberately inert-looking, so
              its contrast with the bordered, colored Not-Completed pill
              right beside it is what signals "one of these is clickable,
              the other isn't." The pill reuses shared/NotCompletedPill.jsx
              — the exact same component BatchTable.jsx's Enrollments
              column renders, not a hand-copied second version — so
              label/style/omit-at-zero can't drift between the two pages.
              A sibling of the row-expand button above, not nested inside
              it: interactive controls can't nest inside each other. */}
          <div className="hidden sm:flex shrink-0 items-center gap-2 pl-2.5 pr-1">
            <StatBadge label="Skills" count={skillCount} detail={skillDetail} variant="panel" className="hidden xl:flex" />
            <StatBadge label="Certificates" count={certCount} detail={certDetail} variant="panel" className="hidden lg:flex" />
            {/* "Assigned" (not "Trainings") is this metric's established
                name in this codebase — same count, same word EmployeeList's
                sibling views already settled on (see the module doc comment
                above: Enrollments is a batch's headcount, Assigned is a
                person's training count, deliberately not interchangeable
                with "Trainings"). Now a CountBadge like its two new
                siblings, not the old plain-text-with-inline-number version,
                so all three read as one consistent stat group. Its hover
                panel (2026-08-27) lists every assigned training by name +
                status — same rich-list treatment as Skills/Certificates,
                replacing the old one-line "3 completed · 2 in progress ·
                9 not started" aggregate. */}
            <StatBadge label="Assigned" count={assignedCount} detail={assignedDetail} variant="panel" />
            <NotCompletedPill
              ref={notCompletedBtnRef}
              count={notCompletedCount}
              interactive
              onClick={pinNotCompletedPreview}
              onMouseEnter={() => CAN_HOVER && !pinned && notCompletedTooltip.scheduleShow()}
              onMouseLeave={() => CAN_HOVER && !pinned && notCompletedTooltip.scheduleHide()}
              onFocus={() => !pinned && notCompletedTooltip.scheduleShow()}
              onBlur={() => !pinned && notCompletedTooltip.scheduleHide()}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeNotCompletedPreview();
              }}
              aria-haspopup="dialog"
              aria-expanded={pinned || notCompletedTooltip.open}
              className={`${FOCUS_RING} ${PRESS_CLASS}`}
            />
          </div>

          {/* Role — status/role info anchored at the row's right edge, per
              the row's 3-zone layout (name+badges left/center, this alone
              at the end). Wasn't shown anywhere on this row before. */}
          <span className="hidden md:inline-block shrink-0 text-[11px] text-gray-400 dark:text-gray-500 pl-2 pr-3 truncate max-w-[7rem]" title={role}>
            {role}
          </span>
        </>
      )}

      {isDrillable && (
        <EmployeeDrillPeek
          anchorRef={rowRef}
          open={peekOpen}
          employee={employee}
          panelId={peekId}
          onNavigate={() => {
            handleDrill();
            setPeekOpen(false);
          }}
          onMouseEnter={() => CAN_HOVER && scheduleShow()}
          onMouseLeave={() => CAN_HOVER && scheduleHide()}
          onFocus={() => clearTimeout(hideTimerRef.current)}
          onBlur={scheduleHide}
        />
      )}

      {notCompletedCount > 0 && (
        <NotCompletedPreview
          pinned={pinned}
          hoverOpen={notCompletedTooltip.open}
          onRequestClose={closeNotCompletedPreview}
          onMouseEnter={() => CAN_HOVER && notCompletedTooltip.scheduleShow()}
          onMouseLeave={() => CAN_HOVER && notCompletedTooltip.scheduleHide()}
          anchorRef={notCompletedBtnRef}
          employeeName={name}
          trainings={notCompletedTrainings}
        />
      )}
    </div>
  );
}

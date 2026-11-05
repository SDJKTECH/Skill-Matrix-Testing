# Employee Navigation Guide

## Overview

The main navigation is a vertical sidebar on the left of the application. It is defined in `frontend/src/component/Sidebar.jsx`. This guide lists every entry, who sees it, and how it behaves, including the **Learning Center** entry (Jira SMT-21) that routes to the Employee Learning Center page.

Screenshots are not included; the final UI is described in text below.

## Sidebar Layout

- On desktop the sidebar starts **collapsed** as a narrow icon-only strip. The chevron button at its top expands it (labels shown next to icons) or collapses it again.
- When collapsed, hovering an icon shows a tooltip with the entry's name. The tooltip uses the same text as the expanded label.
- On mobile the sidebar opens as a drawer headed "Navigation", with a close (X) button. Labels are always shown and selecting an entry closes the drawer.
- The entry for the page that is currently open is highlighted (light blue background, blue text). No entry is highlighted while the chat panel is open.

## Navigation Entries

Entries appear in this order.

| # | Label | Icon | Opens | Visible to |
|---|-------|------|-------|-----------|
| 1 | Home | House | Home page | All employees |
| 2 | Profile | User | Profile page | All employees |
| 3 | Overview Graph | Bar chart | Overview graph | All employees, **desktop only** (hidden on mobile) |
| 4 | Learning Center | Open book | Employee Learning Center page | All employees |
| 5 | Approvals | Checked box | Approvals page | All employees |
| 6 | Reports | Download | Report download page | Full-access roles only |
| 7 | Admin Console | Gear | Admin Console (Manage Tables / Manage Webhooks) | Full-access roles only |
| 8 | Admin Dashboard | Sidebar panel | Admin Dashboard overview | Full-access roles only |

Reports, Admin Console and Admin Dashboard are shown only when the signed-in user's role passes `hasFullAccessRole` (`frontend/src/helper/accessRoles.js`). Other employees do not see them.

## Learning Center Entry

- **Label:** "Learning Center" (from `NAV_LABELS.learningCenter` in `Sidebar.jsx`).
- **Position:** between Overview Graph and Approvals.
- **Icon:** open book (`FiBookOpen` from `react-icons/fi`).
- **Behaviour:** selecting the entry calls `handleLearningCenter`, which sets the active tab to `learning-center` and then calls `onNavigate`. The Learning Center page then opens. On mobile, `layout.jsx` uses `onNavigate` to close the drawer.
- **Route:** the tab id `learning-center` is registered in `frontend/src/component/MainComponent.jsx`. It maps to the `EmployeeLearningCenter` component (`frontend/src/component/EmployeeLearningCenter.jsx`), which renders `LearningCenterCatalog` from `frontend/src/features/learning-center`. The tab is in the visible-tabs set without a role check. The page content is described in `docs/learning-center/learningCenterLanding.md`.
- **Active state:** the entry is highlighted while the Learning Center page is open. The check is `isActive("learningCenter")` in `Sidebar.jsx`, which compares the entry with `activeTab === "learning-center"`. Opening another entry removes the highlight.
- **Collapsed sidebar:** only the book icon is shown; hovering it shows the "Learning Center" tooltip.
- **Availability:** shown on both desktop and mobile, and to every role. The entry has no role check in `Sidebar.jsx`.

## Admin Console Flyout

On desktop, hovering **Admin Console** opens a flyout instead of a tooltip: Manage Tables (Skill, Certificate, Training) and Manage Webhooks (Webhooks). On mobile, tapping Admin Console opens the admin area directly.

## Files Involved

- `frontend/src/component/Sidebar.jsx`: nav entry, label, icon, click handler and active-state logic.
- `frontend/src/component/MainComponent.jsx`: maps the `learning-center` tab to its component and lists it as visible.
- `frontend/src/component/EmployeeLearningCenter.jsx`: page wrapper.
- `frontend/src/features/learning-center/`: course catalog used by the page.
- `frontend/src/layout.jsx`: passes `onNavigate` and the mobile drawer props to the sidebar.
- `docs/learning-center/learningCenterLanding.md`: the Learning Center page itself.

## How to Check by Hand

1. From `projects/skill-matrix-v2/`, run `cd frontend && npm run dev`.
2. Sign in as an employee with a non-full-access role. Confirm the "Learning Center" entry (open-book icon) appears between Overview Graph and Approvals.
3. Select it. Confirm the Learning Center page opens and its entry is highlighted.
4. Select another entry (for example Home). Confirm the Learning Center highlight is removed.
5. Collapse the desktop sidebar and hover the book icon. Confirm the "Learning Center" tooltip appears.
6. Resize to mobile width, open the drawer, and select Learning Center. Confirm the page opens and the drawer closes.

No automated tests cover this entry. The project has no frontend test framework.

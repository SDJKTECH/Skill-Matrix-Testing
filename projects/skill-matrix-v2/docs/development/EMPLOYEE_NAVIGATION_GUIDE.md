# Employee Navigation Guide

## Overview

The main navigation is a vertical sidebar on the left of the application. It is defined in `frontend/src/component/Sidebar.jsx`. This guide lists every entry, who sees it, and how it behaves, including the **Learning Center** entry that routes to the Employee Learning Center page.

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

- **Label:** "Learning Center" (from `NAV_LABELS.learningCenter`).
- **Position:** between Overview Graph and Approvals.
- **Icon:** open book.
- **Behaviour:** selecting the entry opens the Learning Center page, which shows the course catalog (`EmployeeLearningCenter` component, rendered by `MainComponent.jsx` for the `learning-center` tab). On mobile the drawer then closes.
- **Active state:** while the Learning Center page is open, the entry is highlighted like any other active entry. Opening another entry removes the highlight.
- **Collapsed sidebar:** only the book icon is shown; hovering it shows the "Learning Center" tooltip.
- **Availability:** shown on both desktop and mobile, and to every role.

## Admin Console Flyout

On desktop, hovering **Admin Console** opens a flyout instead of a tooltip: Manage Tables (Skill, Certificate, Training) and Manage Webhooks (Webhooks). On mobile, tapping Admin Console opens the admin area directly.

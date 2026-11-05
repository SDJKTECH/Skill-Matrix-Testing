# Employee Navigation Guide

## Overview

The main navigation is the sidebar on the left of the application. It lets you move between the main pages. This guide lists every entry, including the **Learning Center** entry (Story SMT-21) that opens the Learning Center page, and describes how the sidebar looks and behaves on desktop and mobile.

Some entries are shown only to admin-level users. They are marked below.

## Navigation Entries

Entries appear in this order, from top to bottom:

1. **Home** - opens the home page.
2. **Profile** - opens your profile page.
3. **Overview Graph** - opens the overview graph page. Desktop only; it is not shown in the mobile drawer.
4. **Approvals** - opens the approvals page.
5. **Learning Center** - opens the Learning Center page. Shown to all employees on desktop and mobile.
6. **Reports** - opens the report download page. Admin-level users only.
7. **Admin Console** - opens the admin area, starting on the Skill table. Admin-level users only.
8. **Admin Dashboard** - opens the Admin overview. Admin-level users only. Other pages can also open one training batch section of this page through a deep link, but the sidebar entry itself is shown only to admin-level users.

For users without admin access, the list shows only Home, Profile, Overview Graph (desktop), Approvals and Learning Center.

Each entry has an icon on the left and its name as text. The Learning Center entry uses an open-book icon (`FiBookOpen` from `react-icons/fi`).

## Learning Center Entry

- Select **Learning Center** to open the Learning Center page.
- The page shows a "Learning Center" heading. For now it shows a dashed placeholder box with the text "Your learning content will appear here."
- While the Learning Center page is open, the entry is highlighted as active (see Active Item Highlight).
- Opening the page does not need any extra permission. The page is available to every signed-in user, including users without admin access.

## How It Works

The Learning Center is a tab in the single-page main area, like Home or Profile. It is not a separate route.

1. **Sidebar** (`frontend/src/component/Sidebar.jsx`): the Learning Center button calls `setActiveTab("learning-center")` and then `onNavigate()`. The button is always rendered, with no role check.
2. **Active state**: the sidebar's `isActive("learningCenter")` returns true when `activeTab === "learning-center"`. In that case the button uses the active classes and sets `aria-current="page"`.
3. **Main area** (`frontend/src/component/MainComponent.jsx`): the tab key `"learning-center"` maps to the `<LearningCenter />` component. The key is in the list of visible tabs for every user, so it is never redirected to Home. It has no section sub-tab bar.
4. **Page** (`frontend/src/component/LearningCenter.jsx`): renders the heading and the placeholder box. It has no data calls.

The current tab is kept in the navigation context (`frontend/src/context/SkillMatrixNavContext.jsx`), which the sidebar and main area both read.

## Desktop Sidebar

- The sidebar starts **collapsed** to a narrow icon-only strip.
- In the collapsed strip, only the icons are shown. Hover over an icon and a dark tooltip appears to its right with the entry name, for example "Learning Center". Tooltips are not shown on small screens.
- Use the arrow button at the top of the sidebar to expand it. Names are then shown next to the icons. Use the same button to collapse it again.
- Hovering **Admin Console** shows no tooltip. It opens a flyout menu with **Manage Tables** (Skill, Certificate, Training) and **Manage Webhooks** (Webhooks).

## Mobile Drawer

- On small screens the sidebar is hidden.
- Select the menu button in the top header (the three-line icon, labelled "Toggle navigation menu" in `frontend/src/layout.jsx`) to open the sidebar as a drawer from the left. A dark backdrop covers the rest of the page.
- The drawer has a "Navigation" title and a close (X) button. It always shows icons with names.
- Selecting an entry opens that page and closes the drawer. It also closes the chat panel if it is open. You can also close the drawer with the X button or by selecting the backdrop.
- Overview Graph is not listed in the drawer.
- Selecting Admin Console opens the admin area directly, because there is no hover flyout on touch screens.

## Active Item Highlight

- The entry for the page you are on is highlighted with a light blue background and blue text (a darker gray background with lighter blue text in dark mode).
- The Learning Center entry is highlighted this way while the Learning Center page is open. Its button is also marked as the current page for screen readers.
- Inactive entries use gray text and show a gray background when hovered.
- No entry is highlighted while the chat panel is open.

## Files Involved

| File | Role in this feature |
|------|----------------------|
| `frontend/src/component/Sidebar.jsx` | Learning Center nav entry, its label (`NAV_LABELS.learningCenter`), click handler, and active state |
| `frontend/src/component/MainComponent.jsx` | Maps the `"learning-center"` tab to the page and keeps it visible for all users |
| `frontend/src/component/LearningCenter.jsx` | The Learning Center page (placeholder for now) |
| `frontend/src/layout.jsx` | Hosts the sidebar; the mobile menu button and the `onNavigate` callback that closes the drawer and chat |
| `frontend/src/context/SkillMatrixNavContext.jsx` | Holds the active tab used for highlighting and page selection |

## How to Test by Hand

The frontend has no automated tests, so check these steps in a browser:

1. Start the dev server: `cd frontend && npm run dev`, then open the app and sign in.
2. **Entry shown**: on a desktop screen with an admin account, confirm a "Learning Center" entry (open-book icon) appears between Approvals and Reports. For a non-admin account, it appears directly after Approvals. Hover it while the sidebar is collapsed and confirm the tooltip reads "Learning Center". Expand the sidebar and confirm the name is shown.
3. **Entry opens the page**: select it. The "Learning Center" heading and the dashed placeholder box should appear in the main area.
4. **Active highlight**: while the page is open, the Learning Center entry should have the blue active style. Other entries should not. Other pages should not highlight it.
5. **Accessibility**: inspect the button and confirm it has `aria-current="page"` while the page is open and no `aria-current` on other pages.
6. **Chat**: open the chat panel and confirm no sidebar entry is highlighted. Select Learning Center and confirm the chat panel closes.
7. **Mobile**: resize to a small screen, open the menu from the header, and confirm the Learning Center entry is listed with its name. Select it, and confirm the drawer closes and the page opens.
8. **Role check**: sign in with a non-admin account and confirm Learning Center is still listed, while Reports, Admin Console and Admin Dashboard are not.

## Notes

- This guide describes the interface in words only; it has no screenshots.
- The Learning Center page is currently a placeholder. This guide will need an update when its real content is added.
- The Learning Center entry is not gated by role, and neither is the page itself. Any future permission rule must be added in `Sidebar.jsx` and `MainComponent.jsx`.

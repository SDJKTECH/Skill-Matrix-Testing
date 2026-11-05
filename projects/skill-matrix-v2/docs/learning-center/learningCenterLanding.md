# Learning Center landing page (SMT-23)

## What it does

The Learning Center is the page employees open from the navigation to reach training content. It is a frontend-only view; it has no backend function of its own.

## Route

- Tab id: `learning-center`, registered in `frontend/src/component/MainComponent.jsx` (tab map and the list of employee-visible tabs).
- Component: `EmployeeLearningCenter` (`frontend/src/component/EmployeeLearningCenter.jsx`), which renders `LearningCenterCatalog` from `frontend/src/features/learning-center`.

## Page content

- Title: an `<h1>` heading shown at the top of the page, with a book icon.
- Content area: below the title, the page shows the course filter bar and the list of training courses. While courses load it shows "Loading courses…"; if none match it shows "No courses match your filters. Try clearing some of them."; if loading fails it shows an error message.

## Request and response

None. The course list is fetched by the existing training courses hook.

## Behaviour

- Selecting the Learning Center entry in the sidebar opens this page.
- The sidebar entry is highlighted while the page is open (handled by the sidebar's active-tab logic).

## How to check by hand

1. Run `cd frontend && npm run dev` and sign in as an employee.
2. Select the Learning Center entry in the sidebar.
3. Confirm the page title and the content area (filter bar and course list or empty message) appear, and the sidebar entry is highlighted.

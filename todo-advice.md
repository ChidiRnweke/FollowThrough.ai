Here's my take: **This view is struggling with visual noise and fragmented layout controls.**

Right now, you have 3 separate control clusters right under the header (`Board/List`, `Basic/Detailed`, `All/Mine/Waiting on`), vertical columns that get squished in the center, a horizontal scrollbar clipping your list view, and cards that look cluttered when "Detailed" is enabled.

Here is how to redesign this **Todos** experience so it matches the clean, editorial standard you set on the Inbox page:

---

### 1. Simplify the Control Bar (Too Many Toggles!)

You currently have three pill toggles competing for visual attention in a single row:

* Combine **View Mode** (`Board` | `List`) into a clean icon-toggle or subtle segmented control on the left.
* **Basic vs Detailed** shouldn't be a top-level global toggle—it adds massive layout shift. Make "Basic" (clean title-only cards) the default board view, and let clicking a card open the detail panel on the right.
* Move the filter tabs (`All` | `Mine` | `Waiting on`) to align cleanly to the right side as text links or subtle filter chips.

---

### 2. Fix the Board Cards & Columns

* **Card Noise:** In `todo-detail.png`, every card shows 5 stacked metadata dropdowns (`No due date`, `No priority`, `Mine`, `No source`, `Created 10 days ago`). It makes the board feel heavy and chaotic. **Rule of thumb:** Only show metadata badges on a card if they actually have a value set (e.g., if there's a set due date or high priority). Hide empty state tags!
* **Text Truncation:** "Reduce time spent bro..." is cutting off prematurely because the columns are compressed into the center. Expand the board width (`w-full`), give columns a flexible min-width, and let long titles wrap smoothly over 2 lines.

---

### 3. Redesign the List View (`todo-list.png`)

* **Kill the horizontal scrollbar:** The table is overflowing and forcing a scrollbar inside a white canvas.
* **Editorial List Layout:** Instead of a heavy database table, present tasks as a clean, spacious list with subtle column alignment:
```text
[ ] Reduce time spent browsing — act on...    In progress    Mine    No due date
[ ] Hello world!                              Backlog        Mine    No due date

```



---

### 4. Polish the Right Slide-over Sheet (`todo-sidebar.png`)

* **Remove input outlines for metadata:** The right sidebar uses full rounded input boxes for every single field (`Status`, `Priority`, `Responsibility`, `Source`), which looks like an unstyled HTML form.
* **Property List Style:** Use a clean 2-column key-value layout (like Notion or Linear):
```text
Status          🟢 In progress
Priority        🚩 High
Assignee        👤 Chidi Nweke
Source          📄 Hello note

```



---

### Summary Layout Hierarchy

```text
Inbox > Todos
Todos
Commitments and follow-ups in Inbox.

[ ⊞ Board  ☰ List ]                             All  •  Mine  •  Waiting on
─────────────────────────────────────────────────────────────────────────────

BACKLOG 1                OPEN 0              IN PROGRESS 1             DONE 0
┌──────────────────────┐ ┌─────────────────┐ ┌───────────────────────┐ ┌─────────┐
│ ⠿ [ ] Hello world!   │ │ Nothing open.   │ │ ⠿ [ ] Reduce time     │ │ Nothing │
│                      │ │                 │ │       spent browsing  │ │ done.   │
│                      │ │                 │ │ 📅 Jul 28  🚩 High    │ │         │
└──────────────────────┘ └─────────────────┘ └───────────────────────┘ └─────────┘

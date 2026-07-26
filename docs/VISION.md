# followthrough.ai — product vision

> Preserved verbatim from the original README. The [README](../README.md) covers what the app is and how to run it; this is why it exists.

> An AI-native note editor you never have to brief — it turns notes into actions, keeps project context available to agents, and helps carry work through to a finished deliverable.

## What followthrough.ai is

followthrough.ai is a personal workspace for project-based knowledge work.

It combines four things that are usually separated:

- Markdown notes for thinking and drafting
- A lightweight Kanban board with deadlines
- Project-scoped memory for agents
- Contextual skills that transform work into useful outputs

The goal is not simply to capture information. The goal is to help work move forward.

A note should be able to become a task.  
A paragraph should be able to become a diagram.  
A project should retain the context needed to continue without repeated explanation.  
A rough draft should be able to become a polished document or presentation.

The core promise is:

> **Think in notes. Track what matters. Preserve the context. Finish the work.**

## Why it exists

The current workflow often spans multiple tools:

1. Write in Markdown.
2. Open a terminal agent.
3. Explain the project context again.
4. Copy content between tools.
5. Create tasks separately.
6. Build diagrams and find images manually.
7. Reformat the result into a document or presentation.

followthrough.ai brings that flow into one focused environment.

It should feel less like using a collection of disconnected tools and more like working inside a project that understands its own context.

## The core workflow

### 1. Capture and develop ideas

Write notes in Markdown.

Notes can contain rough thinking, meeting notes, research, plans, explanations, decisions, drafts, and source material.

Markdown is the working surface because it is fast, flexible, and easy to edit.

### 2. Turn thinking into action

Create cards directly from notes or ask an agent to suggest them.

Cards live on a simple Kanban board and may have deadlines.

The board should make it easy to see:

- What needs to be done
- What is in progress
- What is waiting
- What is overdue
- What is due soon
- What has been completed

The connection between a card and the note it came from should remain clear, so action never loses its original context.

### 3. Preserve project context

Each project has its own memory.

Project memory contains the facts, decisions, constraints, terminology, preferences, and current state that agents need in order to help effectively.

This memory should make it possible to reopen a project after several days or weeks and continue without rebuilding the context from scratch.

Agents may suggest updates to project memory, but the user remains in control of what becomes part of the project’s durable understanding.

### 4. Transform content in place

Skills act directly on selected content, notes, cards, or project context.

Examples:

- Turn a paragraph into a Mermaid diagram
- Turn a diagram into an editable draw.io artifact
- Find and insert a relevant image
- Rewrite or expand a section
- Extract action items
- Draft a follow-up
- Create a brief
- Turn notes into a presentation draft
- Produce a document from the current project

The intended interaction is simple:

> **Select something → run a skill → review the result → continue working**

AI should operate on the work itself, not merely sit beside it in a chat panel.

### 5. Produce finished deliverables

The workspace should help turn rough project material into outputs that can leave the app.

That includes:

- Documents
- Presentations
- Diagrams
- Images
- Reports
- Briefs
- Emails
- Other project artifacts

A project’s notes, board state, memory, and generated artifacts should work together when producing these outputs.

The final step is not “generate something.” It is “finish something useful.”

## The main concepts

### Projects

Projects are the primary unit of work.

A project brings together its notes, board, deadlines, memory, skills, and outputs.

Opening a project should immediately answer:

- What is this project about?
- What matters now?
- What is due?
- What am I waiting on?
- What has already been decided?
- What context should the agent know?
- What can I produce next?

### Notes

Notes are where thinking happens.

They are the main source material for tasks, memory, diagrams, drafts, and deliverables.

### Project context and files

RAG based on the project’s notes, memory, and artifacts should give agents the context they need to help without repeated prompting.

### Board

The board is a lightweight way to track movement.

Its purpose is to show what work exists, where it is, and when it is due.

### Memory

Memory gives agents project-specific understanding.

It should reduce repetitive prompting and help outputs stay consistent with the project’s goals, terminology, history, and constraints.

### User profile and memory

The user profile contains the user’s preferences, style, and other personal context. It should be available to agents across projects, but the user remains in control of what is stored and shared. For instance, writing style, job title, what they know / don't know.

### Skills

Skills are reusable actions that transform project material.

They should feel like tools inside the workspace, not generic prompts the user has to reconstruct each time.

### Artifacts

Artifacts are the things created from the work: diagrams, images, documents, presentations, and other outputs. Diagrams are rendered as much as possible inside the app.

They are part of the project, not isolated generations.

## How agents should behave

Agents should be project-aware, contextual, and reviewable.

They should:

- Use the current project’s context
- Act on the selected material
- Propose rather than silently commit important changes
- Keep generated work connected to its source
- Help move work toward completion
- Prefer concrete outputs over open-ended conversation

The user remains the source of truth.

A useful guiding principle is:

> **Agents propose. The user accepts.**

## Product experience

followthrough.ai should feel:

- Focused rather than general-purpose
- Calm rather than crowded
- Contextual rather than prompt-heavy
- Direct rather than conversational
- Inspectable rather than magical
- Oriented toward completion rather than accumulation

The best interactions should be short and obvious:

```text
Note → Card
Selection → Diagram
Selection → Image
Project context → Draft
Draft → Deliverable
```

## Success criteria

followthrough.ai is successful when it becomes the preferred place to resume and advance project work.

It should make it easier to:

- Understand the current state of a project
- See what needs attention
- Continue without rebuilding context
- Turn notes into actions
- Turn ideas into artifacts
- Turn rough work into finished outputs

The practical test is:

> **Do I increasingly choose followthrough.ai instead of opening a Markdown editor and a terminal agent to do the same work manually?**

## One-sentence description

> **followthrough.ai is an AI-native note editor you never have to brief — with project-scoped agent memory, a lightweight deadline board, and contextual skills that turn notes into actions, artifacts, and finished deliverables.**

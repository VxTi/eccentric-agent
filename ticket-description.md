---
inclusion: manual
---

# Jira Ticket Creation Guide

## Project

- Project key: **A20** (App 2.0)
- Cloud ID: `b89b3abc-4dab-4301-a4e3-e50005c27def`

## Ticket Hierarchy

Features are organized hierarchically: **Epic → Story → Task**

> **Issue type rules:**
>
> - Parent tickets are always **Story**
> - Child tickets (implementation) are always **Task**
> - Link child Tasks to their parent Story using the **"Implements / Treats"** link type
>
> **Jira limitation**: Stories and Tasks are at the same hierarchy level (level 0) in this project. Tasks cannot be set
> as children of Stories via the `parent` field. Instead, use **"Implements / Treats"** issue links to connect Tasks to
> their parent Story. Only Epics (level 1) can be true parents of Stories/Tasks.

### Standalone Tickets (no parent Story)

For smaller pieces of work that don't warrant a full parent Story, create a standalone ticket:

- Issue type: **Task**, **Bug**, or **Tech Debt**
- No parent Story link needed
- Same creation rules apply (Preparing status, no estimation, no fix version)
- Use the same naming convention as child tickets: `BFF - <description>`

### Feature (Epic)

Represents the complete feature. Contains:

- Introduction
- Goal
- Scope
- Design/user flow
- Backwards compatibility/behaviour

### Parent Ticket (Story)

Describes the functional requirement and user perspective. Single source of truth for testing.

Required content:

- User story format: "As a [role], I want [goal], So that [reason]"
- Complete acceptance criteria
- Business decision points (YES/NO questions)
- Cross-platform considerations: design requirements, localization needs, accessibility changes, feature flags,
  backwards compatibility solutions
- Linked implementation tickets (implements/implemented by relationships)
- Impact and scope documentation

### Child Ticket (Task)

Platform-specific implementation ticket (BFF, iOS, or Android).

Required content:

- Component label (BFF, iOS, or Android)
- Detailed implementation description
- Backwards compatibility approach for that platform

Not set at creation time (handled later):

- Fix version (done during team refinement meeting)
- Story point estimation (done during team refinement meeting)
- Status is always set to **Preparing** on creation

## Naming Conventions

| Type                  | Pattern                      | Examples                                                             |
|-----------------------|------------------------------|----------------------------------------------------------------------|
| Feature (Epic)        | Descriptive feature name     | Loyalty card in wallet                                               |
| Parent ticket (Story) | `Story - <description>`      | Story - Add support for wallet functionality                         |
| Child ticket (Task)   | `<Component>: <description>` | BFF - Personalized Promotions Phase 3 - Add support for Apple wallet |

For BFF child tickets, always prefix with `BFF - Personalized Promotions Phase 3 -`.

## Story Points

Use the **Fibonacci scale** for regular tickets: 1, 2, 3, 5, 8, 13.

### Spike Estimation

Spikes are estimated in increments of 4 hours, mapped to points:

| Timebox  | Story Points |
|----------|--------------|
| 4 hours  | 3            |
| 8 hours  | 5            |
| 12 hours | 8            |

Spikes generally should not exceed 12 hours.

## Ticket Types

### Regular Tickets (Story/Task)

Standard feature work following the hierarchy above.

### Spikes

Time-boxed research or exploration tasks. Always include:

- A timebox (in hours)
- A clear expected outcome

Spike outcomes can be:

- New JIRA tickets for subsequent work
- Conclusions merged into the repository
- Conclusions documented in Confluence

Name format: `BFF - [SPIKE] <description>`

### Bug Tickets

Must include:

- Reproduction steps
- Expected versus actual results
- Environment/device details

### Analytics Tickets

Track measurement requirements, events, parameters, and test scenarios.

### BDD Tickets

Written in given-when-then format. Name must start with `BDD - `.

### Release Tickets

Used by testers as regression checkpoints during release cycles.

## Workflow Statuses

| Status         | Meaning                                                   | Transition ID |
|----------------|-----------------------------------------------------------|---------------|
| Preparing      | Ticket is being written up, information may be incomplete | 271           |
| Triage         | Information is complete but ticket is not yet estimated   | 261           |
| To Do          | Ticket is estimated and ready to be picked up             | 281           |
| In Progress    | Actively being worked on by the assignee                  | 21            |
| Code Review    | Implementation done, awaiting peer review                 | 301           |
| Ready For Test | Peer reviewed, ready for the testing team                 | 221           |
| In Test        | Being tested by a tester                                  | 211           |
| Done           | No more work needed                                       | 31            |

When creating new tickets, set the status to **Preparing** (transition ID `271`) and do **not** add story point
estimates. Estimation happens later during team refinement sessions.

## Components

- Use **one** component per ticket: UX, Backend (BFF), Android, or iOS
- Add multiple components only when the ticket requires work from multiple subteams

For BFF work, use the `BFF` component.

## Labels

Labels are managed by the PO/business team only. Do not add or modify labels (e.g., OPEX, it4it).

## Tags

Tags can be freely used. Common tags:

- `analytics`
- `accessibility`

## Fix Versions

Set the fix version when code is merged to the `develop` branch. Format: `BFF v2.XX.0`.

## Issue Links

| Link Type              | Usage                                                                          |
|------------------------|--------------------------------------------------------------------------------|
| Implements / Treats    | Link child Tasks to their parent Story                                         |
| blocks / is blocked by | This ticket must be finished before starting the blocked ticket                |
| relates to             | Distinguish similar tasks across platforms (e.g., Android vs iOS counterparts) |

## Priority

Priority is not actively managed via the priority field. Higher-priority items are moved higher on the backlog instead.

## Sprint Assignment

Tickets are assigned to sprints during bi-weekly planning meetings. Do not assign sprints when creating tickets.

## Documentation Rules

- The ticket description is the **single source of truth** for all information
- Comments are for status updates and discussion only
- All conclusions and decisions must be documented back in the description
- When a decision is made against pursuing something, use ~~strikethrough~~ in the description with reasoning in
  comments

## Tester Field

Testers use a custom "Tester" field to divide work. They do not assign themselves as the ticket assignee.

## Creating a BFF Ticket (Quick Reference)

When creating a new BFF task:

1. Issue type: `Task` (or `Story` if it's a parent ticket, or `Bug` for bug fixes)
2. Summary: `BFF - <description>` (or `BFF - [SPIKE] <description>` for spikes)
3. Component: `BFF`
4. Status: **Preparing** (default for new tickets)
5. Description: Implementation details + backwards compatibility approach
6. If it has a parent Story: link using **"Implements / Treats"**
7. Do NOT set: labels, sprint, priority field, story points, fix version

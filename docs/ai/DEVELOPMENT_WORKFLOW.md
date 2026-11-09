# Development Workflow

These project-scoped rules apply to planning, new tasks, continued development, bug fixes, material task revisions and reviews, regardless of the request's wording or the agent/tool in use. They define a workflow, not product requirements. Discover this project's own approved requirements and constraints; do not import decisions from another project. This file is self-contained and requires no orchestration extension or exchange-file format.

This workflow supplements the target project's existing instructions and approved authority hierarchy. Preserve its product decisions, project-specific rules, stricter verification and approval gates; do not use this generic workflow to waive them. Resolve material conflicts with the user before dependent work.

## 1. Establish project context

- Identify the actual target project/root before changing files. Read its applicable project instructions, including relevant parent or nested instructions where the tool supports them.
- Discover authoritative product vision, roadmap, approved decisions, architecture constraints, task intent and current implementation status from the project's own documentation and user-provided sources. Do not assume fixed filenames, locations or a particular documentation structure.
- Confirm sources are current and approved. Drafts, examples, proposed roadmap items and agent progress notes are not binding decisions or verified completion. Identify conflicts and ask the user which approved source governs; do not silently invent precedence or requirements.
- If the root or necessary sources cannot be identified or accessed, state what is missing. Continue useful read-only discovery where possible, but do not assume alignment or begin an unapproved implementation.
- If reliable project-level requirements or architecture information is absent, explicitly state: **Long-term alignment cannot be fully verified.** Explain which information is unavailable; never manufacture product decisions to fill the gap.

## 2. Select context and verification by risk

- Read relevant authoritative documents and inspect affected code, interfaces, dependencies and tests. Reuse established context only while reliable, accessible and current; identify reused context and material limitations.
- Search narrowly and inspect directly affected modules first. Avoid rereading the entire codebase, repeating exhaustive audits or running broad test suites for every small change.
- Expand inspection when changes affect core architecture, calculations, persistent data, migrations, security boundaries or important/shared interfaces. Explain the risk that justifies broader work.
- Check for existing implementations, duplicate work and ongoing changes before proposing new work. Keep explanations and context summaries concise; link existing sources instead of copying large documents.
- If navigation is insufficient, propose a lightweight link-only context index. Do not create or rewrite authoritative requirements merely to make a task appear aligned.

## Token efficiency, review risk and agent authorization

Classify the active change as low, medium or high risk during planning and record the reason in existing task metadata. Reassess if scope or affected interfaces change; classify by behavior and data impact, not a UI/documentation label.

| Risk | Implementation and verification | Work review before acceptance |
| --- | --- | --- |
| Low | Claude implementation when Claude is selected, with focused tests or document checks appropriate to the change. | No automatic Work review. Routine UI, styling and documentation changes do not require Work review unless their actual impact is higher-risk or an existing explicit acceptance gate requires it. |
| Medium | Selected developer, targeted tests and affected-interface checks. | Optional; use the user's preference and unresolved risks. Do not silently launch a review. |
| High | Selected developer, focused implementation checks and the project's defined acceptance verification. | Independent ChatGPT Work review is required before acceptance. If unavailable, record it as pending and do not imply the high-risk acceptance gate has passed. |

High-risk project domains include **HomeReady: financial calculations, investment engines, mortgage logic, tax logic and data integrity**, and **Music Tree: reward calculations, persistent user data, authentication and child data protection**. Equivalent financial, security, data-integrity and privacy changes in future projects are high-risk. A styling or documentation change that changes one of these behaviors/policies must be assessed for that impact. An explicitly requested Work review is still performed at any risk level. Existing product-specific proposal comparisons, approval gates and acceptance requirements remain in force; this policy does not waive them or create automatic reviewers.

- Read only task-relevant instructions, authoritative documents, code and dependencies. Reuse current `ACTIVE_TASK.md` where present, existing checkpoint metadata and applicable test evidence; do not create a new task system to follow this rule. Do not repeat repository-wide audits. Reused results remain dated evidence of the state tested, not proof that changed code still passes.
- Run focused tests during implementation. Run full verification only at the project's defined acceptance gates or when the change's risk, affected interfaces or failures justify it. Preserve stricter milestone/financial acceptance requirements. For documentation-only work, check consistency, references and scope without running application suites.
- Keep handovers concise: approved task/scope, selected and actually launched agent, changed files, current step, relevant decisions, latest applicable test evidence, unresolved risks and next action. Summarize successful test logs with command, outcome and counts; retain failure details and evidence locations when needed.
- If Claude is selected, keep Claude as the developer. **Never launch Codex automatically. Require explicit user approval before every Codex launch**, including restarts or resumed sessions that start a new process. Selecting Codex or approving a general task is not per-launch approval. No silent failover, hidden Codex requests, background Codex checks or Codex calls during handovers. Read-only local discovery is not permission to call a provider. If an agent is unavailable, report the blocker and wait for a provider decision.
- Reuse existing task records to note the selected developer and agent actually launched (provider and session/launch evidence when available). If none was launched, record none; an open panel, selected provider or old PID does not prove a launch or execution. Do not infer identity or progress from another agent's claim.
- Record Work review as **requested**, **skipped** or **completed**, with task/risk, reason and evidence. Skipped low/medium-risk review is not an Accept recommendation. Completed requires an actual independent review, its recommendation, rationale and remaining risks; simulated review files and developer self-checks are not independent Work reviews. High-risk reviews remain requested/pending until completed. Use existing supported task fields or concise existing task notes; do not add unsupported schema fields, telemetry, services or new tracking infrastructure. Keep review completion separate from the user's final acceptance.

## 3. Mandatory Pre-Development Alignment Check

Before implementing a new task or bug fix, or writing/substantially revising its final development instruction, perform this check. It applies to the intended action, not keywords such as plan, create, implement, fix or continue.

1. Compare proposed work with the project's approved goals, roadmap, product/architecture decisions, constraints and observed implementation.
2. Identify necessity, already-implemented or duplicated work, contradictions, scope drift, unnecessary complexity, affected interfaces and integration/regression risks.
3. Choose the minimum scope consistent with approved goals. Define the objective, included work, exclusions, acceptance criteria, proportionate verification and stop conditions.
4. Present the concrete proposal before making implementation changes or publishing its final development instruction. State the sources/files examined, alignment outcome and rationale, reused context, risks, missing evidence and decisions needed.
5. Obtain explicit user approval of that proposal before implementation or final instruction creation. A general request for work does not approve an unseen proposal. Alignment alone is not authorization.

Use exactly one pre-development outcome:

- **ALIGNED**: supported by existing approved project decisions and consistent with relevant constraints. Await user approval of the concrete proposal.
- **NEEDS DECISION**: conflicts with an approved decision or requires a new product/architecture choice. Explain the conflict/options, obtain the user's decision, reassess and seek approval of the resulting scope.
- **CANNOT ASSESS**: necessary project information is missing, stale or unreliable. Identify the gap and seek clarification or an explicit user decision on a bounded proposal with the limitations disclosed. Do not relabel unknown alignment as ALIGNED.

The user makes the final decision. Explicit approval of bounded work with disclosed uncertainty does not establish missing long-term requirements or authorize other work.

For continued development or rework inside an already approved task, reuse its approval and alignment findings after checking that relevant assumptions remain current. Do not ask for the same approval repeatedly. Reopen the alignment check and obtain renewed approval when objective, scope, constraints, acceptance criteria or material project decisions change. Ordinary corrections within unchanged approved scope and formatting-only edits do not create a new task or require a new product decision.

Before starting another increment or phase, verify prerequisite acceptance and explicit authorization. A roadmap entry or architecture approval alone does not authorize execution.

## 4. Implement only approved work

- Preserve existing functionality, public interfaces, tests and user changes except where the approved task explicitly requires a change. Prefer a small, understandable implementation over speculative abstractions or unrelated refactoring.
- Do not silently add features, dependencies, services, architectural changes or cleanup outside scope. Report blockers and request a decision when a correct solution needs broader scope.
- Use the project's established conventions, development commands and task formats. If a tool-specific format is used, validate its existing schema; do not invent approval fields or unsupported metadata.
- Honor the approved stop conditions and user approval gates. Do not start another task, phase, agent or automated review merely because the current implementation appears finished.

## 5. Git safety, checkpoints and recoverability

- Inspect relevant working-tree/index state before editing. Distinguish pre-existing, staged, unstaged and untracked changes; never discard or attribute another person's work to this task without evidence.
- Never automatically commit, push, reset, clean, force-checkout, delete recovery artifacts or overwrite unrelated files. Obtain explicit authorization for destructive actions or changes to Git history. Preserve useful checkpoints and existing task history.
- Follow the project's existing checkpoint/recovery practices when available. Do not require or initialize a new recovery system, repository or service just to follow these rules.
- Know what recovery evidence actually contains. Metadata, hashes and path lists do not restore deleted source bytes; do not claim full recoverability unless the needed content was captured and restoration is supported.
- If concurrent edits, uncertain ownership or incomplete evidence would make an edit unsafe, preserve state, disclose the uncertainty and resolve it before overwriting anything. Do not stop other agents without explicit authorization.

## 6. Independent Post-Development Review

Every requested review covers all three dimensions:

1. **Goal Alignment**: compare actual work with the approved task and relevant project-level goals, roadmap, decisions, architecture, constraints and exclusions. Prior proposal alignment does not prove implementation stayed aligned.
2. **Implementation & Integration**: inspect changed code and directly affected modules, interfaces, dependencies and tests. Identify defects, regressions, unnecessary changes, duplicate work and scope drift.
3. **Verification & Risk**: independently run appropriate checks and inspect relevant evidence. Include regression/integration verification proportionate to risk; passing unit tests alone does not establish correctness or product alignment. Explain unavailable or unrun checks and remaining risks.

Treat developer summaries and reported test results as claims until independently checked. A genuinely independent review reassesses requirements, implementation and evidence rather than repeating the developer's conclusions. If the same agent only self-checks its own work, label it a self-check, not an independent review. Do not launch an additional reviewer without authorization.

Distinguish evidence explicitly:

- **Verified**: directly observed code, command results or other independently checked evidence; name relevant files, commands, outcomes and limitations.
- **Agent-reported**: a developer or another agent's statement, not independently established.
- **Unknown**: missing, inaccessible, stale, ambiguous or unrun evidence. An untracked-file list or empty diff with no usable baseline does not prove task-specific changes or absence of changes.

State all of the following in the review:

- **Recommendation: Accept / Request Changes / Cannot Verify**.
- **Goal alignment: Aligned / Drift detected / Cannot assess**, with the basis for the conclusion.
- Key evidence, relevant documents/files examined, checks performed and reliable context reused.
- Remaining risks, missing evidence and any concrete required changes; say none identified within the reviewed scope when appropriate.

Use **Accept** when approved criteria and relevant checks are satisfied by independent evidence, with no unresolved material goal/scope conflict. Use **Request Changes** for concrete defects, regressions or goal/scope drift; keep requested corrections within approved scope or identify the need for renewed approval. Use **Cannot Verify** when required evidence or a material alignment/integration question cannot be assessed. Disclose missing long-term context even when bounded task criteria can be verified.

Keep post-development recommendations separate from pre-development outcomes. Do not edit implementation files during a review-only request. Write review artifacts only when authorized, using any project-specified format; otherwise report the findings in the conversation.

## 7. User-controlled acceptance

The reviewer advises; only the user accepts the result or authorizes the next phase. Code changes, passed tests, a finished agent turn or process exit do not imply acceptance. Report what changed, what was independently verified, what remains unknown and what decision is needed. Do not mark a task accepted, close it or start the next task on the user's behalf without explicit authorization.

These rules do not bypass a project's existing approval, permission, execution or acceptance mechanisms. Optional orchestration tools may add their own execution contracts without becoming a prerequisite for this workflow.

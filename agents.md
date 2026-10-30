
# AI SQL Assistant and Agentic Data Analysis Platform
## Project Requirements and Implementation Brief

## 1. PROJECT OVERVIEW

I am a Data Engineer working on a proof of concept (POC) for Progressive.

The goal is to build a reusable AI-powered data analysis application that allows users to interact with data using natural language instead of manually writing SQL or investigating data issues.

The initial application will be a general-purpose AI SQL Assistant. Users will ask questions in plain English, the application will generate SQL using the actual available table schemas, execute the SQL against an approved data engine, and present the results in an easy-to-understand UI.

This application will evolve into a broader agentic data analysis platform. One of the planned future capabilities is an AI analyst that investigates premium reconciliation discrepancies across data processing layers.

The initial goal is NOT to build the entire agentic platform at once. The immediate goal is to establish a clean, working foundation that can be extended incrementally.

This is a time-boxed POC. Prioritize a working, demonstrable end-to-end flow over unnecessary abstractions or enterprise-scale infrastructure.

---

## 2. BUSINESS CONTEXT

The intended business environment involves data processing and premium reconciliation.

The current conceptual data flow is:

1. Majesco provides source data in XML files.
2. The source data is processed and stored in Databricks, including Delta tables.
3. Data is transferred or transformed into an EDW staging layer.
4. Processed data is loaded into a final EDW layer.
5. A three-way balancing report compares premium amounts across the relevant data layers.
6. When an imbalance occurs, a human analyst manually investigates the discrepancy.

For example:

- Source premium total: $4,000
- Databricks premium total: $4,000
- EDW Stage premium total: $3,000
- EDW Final premium total: $3,000

The analyst must determine where the missing $1,000 went.

Possible causes include:

- A failed or incomplete data load.
- Records rejected during ingestion.
- Python transformation logic filtering out records.
- SQL joins removing records.
- Incorrect join keys.
- Transformation rules producing incorrect premium amounts.
- Duplicate or missing records.
- Incorrect aggregations or business rules.
- A downstream load inheriting an upstream discrepancy.
- Data-quality problems or incomplete processing.

The long-term objective is to build an AI analyst that can gather evidence, investigate the affected data, identify the earliest point of divergence, explain the likely root cause, and recommend corrective action.

This business scenario is the future direction of the application. Do not make it the primary UI or hardcode it into the initial application.

---

## 3. CURRENT PROJECT OBJECTIVE

Build a general-purpose AI SQL Assistant.

A user should be able to:

1. Open the application.
2. Enter a question in plain English.
3. Have the application identify the relevant available tables and columns.
4. Generate SQL appropriate for the actual database engine.
5. Inspect the generated SQL before execution.
6. Execute an approved read-only query.
7. View the returned records in a results table.
8. Understand query errors and receive actionable explanations.
9. Ask another question and repeat the process.

Example questions:

- Show the total premium by policy state.
- Find policies with premium greater than 1,000.
- Compare record counts between two tables.
- Find records present in one table but missing from another.
- Show the top 10 policy types by total premium.
- Compare premium totals between source-stage and final-stage tables.

The application must use real table metadata and real query results when connected to a configured data engine. It must not fabricate results or pretend a query has executed when it has not.

---

## 4. DEVELOPMENT ENVIRONMENT AND CONSTRAINTS

### Development environment

- Primary IDE: Visual Studio Code.
- Development language: Python.
- Initial target data platform: Databricks.
- Initial deliverable: a usable UI and a working natural-language-to-SQL workflow.
- Project type: POC.

The UI framework has not been finalized. Evaluate Streamlit first because it can provide a fast, usable Python-based POC. Consider FastAPI only if separating the backend materially improves the implementation. Do not introduce a React frontend, multiple services, or extra infrastructure without a clear reason.

The first milestone should be as simple as possible.

### Initial connectivity constraints

For the current POC:

- Keep the application and analysis workflow centered on Databricks.
- Do not connect to Majesco.
- Do not connect to SQL Server.
- Do not connect to AWS-hosted systems.
- Do not introduce external enterprise integrations.
- Do not assume access to production infrastructure.
- Do not assume that Databricks credentials or an approved LLM endpoint are already configured.

The application will initially use tables and sample data available in the Databricks environment.

Some future data artifacts may include:

- A sample Majesco XML source file.
- A Databricks stage Delta table or CSV snapshot.
- An EDW Stage CSV snapshot.
- An EDW Final CSV snapshot.
- Existing Python transformation code.

These artifacts are intended for the future reconciliation investigation feature. Do not require all of them to be available to build the initial AI SQL Assistant.

The exact workspace, catalog, schema, table names, authentication method, and model endpoint must be discovered or confirmed rather than invented.

---

## 5. PROPOSED INITIAL ARCHITECTURE

Build a small, modular application with the following logical components.

### A. User interface

Responsibilities:

- Accept natural-language questions.
- Display the active data source or selected table context.
- Provide a button to generate or run a query.
- Display generated SQL in an inspectable code area.
- Allow users to review and explicitly approve execution.
- Show execution status, duration where available, and error messages.
- Display query results in a table.
- Support a reasonable result limit.
- Allow the user to submit another question.

The UI should be clean and professional enough for an internal business POC.

Avoid spending excessive time on visual polish before the end-to-end functionality works.

### B. Schema discovery

The application must discover the actual available schema.

It should be able to obtain relevant metadata such as:

- Catalog names.
- Schema names.
- Table names.
- Column names.
- Data types.
- Table descriptions, when available.

The language model must use the relevant schema information to generate SQL.

Do not permanently hardcode assumptions about table names or column names into prompts.

For the initial implementation, discovering metadata for a selected table or a small set of tables is sufficient. Do not implement complex semantic search or a vector database unless later evidence shows it is necessary.

### C. Natural-language-to-SQL generation

The generation component should:

1. Receive the user's question.
2. Receive relevant schema metadata.
3. Receive the target SQL dialect and applicable restrictions.
4. Generate SQL that answers the question.
5. Return the SQL separately from any explanation.
6. Ask for clarification if the question is ambiguous or necessary schema information is missing.

The application should use an LLM endpoint approved and available in the configured environment.

Do not assume that an API key, model endpoint, or particular model is available.

If model access is not configured, identify the missing requirement and provide a clear setup plan. Do not silently substitute hardcoded SQL or fake AI output.

### D. SQL validation and execution safety

Treat all model-generated SQL as untrusted.

Before execution:

- Validate the SQL.
- Restrict the initial feature to approved read-only queries.
- Reject INSERT, UPDATE, DELETE, MERGE, DROP, ALTER, CREATE, TRUNCATE, and other state-changing or unsupported operations.
- Reject multiple statements.
- Apply appropriate query and result limits.
- Validate referenced tables against approved schemas and access permissions.
- Avoid relying solely on a language-model instruction to guarantee safety.
- Use read-only permissions where supported.
- Never expose credentials or secrets in the UI or logs.

Use a validation approach suitable for the chosen SQL dialect. If a reliable validator cannot determine whether a query is safe, reject it rather than executing it.

Do not modify or delete business data.

### E. Query execution

Use the simplest supported Databricks-compatible query execution mechanism.

First inspect the environment and determine which approach is practical:

- Spark SQL through an available Databricks Spark session.
- Databricks SQL Connector for Python.
- An approved Databricks SQL execution API.

Choose one appropriate method for the initial implementation. Do not implement every option.

The application must clearly distinguish:

- SQL generated successfully.
- SQL validated successfully.
- Query submitted.
- Query completed successfully.
- Query failed.

Only display query results after actual successful execution.

### F. Results presentation

Display:

- Generated SQL.
- Query status.
- Returned column names and records.
- Row count.
- Execution duration, if available.
- Meaningful errors when execution fails.

A basic tabular display is enough for the first version.

Charts, downloadable reports, conversation memory, query history, and advanced visualizations are optional future enhancements.

---

## 6. LLM AND AGENTIC DESIGN PRINCIPLES

The initial text-to-SQL workflow does not require a complex multi-agent architecture.

Start with a simple, deterministic pipeline:

User question
    -> Schema retrieval
    -> SQL generation
    -> SQL validation
    -> User approval
    -> SQL execution
    -> Result presentation

Keep these steps modular so the application can later incorporate an agent orchestrator.

Do not introduce multiple specialized agents, autonomous loops, or elaborate agent frameworks unless they solve an actual problem in the POC.

The longer-term agentic system may use tools to:

- Inspect tables and schemas.
- Run diagnostic SQL queries.
- Compare data between layers.
- Analyze missing records and premium differences.
- Read relevant Python transformation code.
- Inspect available pipeline execution logs.
- Gather evidence and form a root-cause hypothesis.
- Recommend next diagnostic actions.
- Produce an investigation report.

The LLM should reason over evidence collected by deterministic tools. It must not invent record counts, premium values, execution failures, code behavior, or root causes.

---

## 7. FUTURE FEATURE: PREMIUM RECONCILIATION ANALYST

Once the general-purpose AI SQL Assistant works, extend the application with a dedicated investigation capability.

### Future input artifacts

- Source XML sample.
- Databricks stage Delta table or CSV snapshot.
- EDW Stage CSV snapshot.
- EDW Final CSV snapshot.
- Relevant Python transformation code.
- Reconciliation totals or balancing report.
- Execution logs, if available.

Initially, these can be static local files or files stored in an approved Databricks location. External system connections are not required.

### Future investigation workflow

1. Load the balancing report or selected batch.
2. Compare premium totals and record counts across the available layers.
3. Determine the earliest point where totals or records diverge.
4. Compare business keys across the relevant datasets.
5. Identify missing, duplicated, or mismatched records.
6. Quantify the financial impact.
7. Inspect relevant transformation code and available execution evidence.
8. Identify the most likely explanation supported by evidence.
9. Recommend the next action.
10. Present the investigation in the UI.

### Future investigation report

The UI should eventually show:

- Batch identifier and investigation status.
- Source and downstream premium totals.
- Record counts by layer.
- Amount and location of the discrepancy.
- Missing or mismatched business keys.
- Relevant transformation logic.
- Evidence supporting each finding.
- Probable root cause.
- Confidence or uncertainty.
- Recommended corrective action.
- Additional checks needed when evidence is insufficient.

The system must distinguish confirmed facts from hypotheses.

It should not automatically modify source data or rerun production pipelines.

Human approval should be required for any future action with operational or financial impact.

---

## 8. FUTURE SCHEDULING AND AUTOMATION

After the on-demand workflow works, consider scheduled execution.

The future architecture should allow a scheduled job or another approved trigger to invoke the same investigation service used by the UI.

Potential future enhancements include:

- Periodic reconciliation checks.
- Automatic investigation of out-of-balance batches.
- Persistent investigation history.
- Notifications.
- Report generation.
- Human review and approval.
- Connections to SQL Server and other enterprise systems.

Do not implement scheduling, notification infrastructure, or production integrations in the first milestone.

Design the initial code so that the investigation logic can be reused by both the UI and a future scheduler.

---

## 9. CODE QUALITY AND PROJECT STRUCTURE

Keep the code straightforward and maintainable.

Possible logical modules:

- UI and user interaction.
- Databricks configuration.
- Schema discovery.
- LLM client and SQL generation.
- SQL validation.
- Query execution.
- Results formatting.
- Tests.

The exact directory structure should be decided after inspecting the current workspace.

Requirements:

- Use clear names and type hints where useful.
- Separate UI logic from query-generation and execution logic.
- Keep configuration outside source code where appropriate.
- Use environment variables or approved secret-management mechanisms for credentials.
- Provide a safe example configuration without real secrets.
- Add dependency and setup instructions.
- Add focused tests for SQL validation and core workflow behavior.
- Avoid unnecessary frameworks and dependencies.
- Do not overwrite existing project files without understanding their purpose.
- Do not invent completed work or claim untested code works.

A small, working application is more valuable than an elaborate architecture that cannot be demonstrated.

---

## 10. ACCEPTANCE CRITERIA FOR THE FIRST MILESTONE

The initial milestone is complete when:

1. The application starts successfully in the chosen development environment.
2. The UI accepts a natural-language question.
3. The application can retrieve actual metadata for a configured Databricks table or set of tables.
4. An available LLM can generate SQL grounded in that metadata.
5. The generated SQL is visible for review.
6. Unsafe queries are rejected before execution.
7. The user can approve execution of a validated query.
8. The query executes against the configured data engine.
9. The UI displays the actual returned records.
10. Query failures are presented clearly.
11. Setup requirements and known limitations are documented.
12. No connection to Majesco, SQL Server, or other external systems is required.

If an environment dependency prevents completion, demonstrate the working portions honestly and document the blocker.

Do not claim that the acceptance criteria are satisfied until they have actually been tested.

---

## 11. IMPLEMENTATION PRIORITIES

Follow this order:

Priority 1: Inspect the existing VS Code workspace and development environment.

Priority 2: Identify the Python version, dependency management approach, current files, and available Databricks access.

Priority 3: Determine how the application will access Databricks tables and how an approved LLM will be called.

Priority 4: Propose the smallest viable architecture and file structure.

Priority 5: Build a minimal UI that starts successfully.

Priority 6: Implement schema discovery.

Priority 7: Implement text-to-SQL generation.

Priority 8: Implement SQL validation and execution.

Priority 9: Display results and handle failures.

Priority 10: Test the end-to-end workflow.

Only after the first milestone works should the project move to agentic investigation and reconciliation features.

---

## 12. WHAT YOU MUST DO FIRST

Do not immediately generate the entire application.

Start by inspecting the current repository and available development environment.

Then return a concise assessment containing:

1. What files and folders already exist.
2. Which Python version and environment appear to be available.
3. Whether this is an empty project or an existing application.
4. What Databricks connectivity is already configured, if anything.
5. Whether an approved LLM endpoint or credentials configuration is apparent.
6. Which critical details are missing.
7. The recommended minimal architecture.
8. The proposed file structure.
9. The first implementation step and how we will verify it works.

Do not print, expose, or copy secret values when inspecting configuration.

Do not assume that the workspace is connected to Databricks merely because the developer uses VS Code.

Do not create fake production data, invent credentials, or hardcode unverified infrastructure details.

After reporting the assessment, wait for my approval before making substantial changes to the repository.

My immediate goal is to build the first working version of the general-purpose AI SQL Assistant. Keep every implementation decision aligned with that goal.
